from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import uuid
from io import BytesIO
from pathlib import Path
from typing import Dict, Optional, Tuple

TTL = 600
DEFAULT_MAX_PENDING_BANNERS = 256
DEFAULT_MAX_PENDING_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_PERSISTED_BANNERS = 2000
DEFAULT_MAX_PERSISTED_BYTES = 512 * 1024 * 1024

BASE = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE / "static"
BANNER_DIR = STATIC_DIR / "banners"
PENDING_DIR = BANNER_DIR / ".pending"
BANNER_DIR.mkdir(exist_ok=True, parents=True)
PENDING_DIR.mkdir(exist_ok=True, parents=True)


class BannerStoreCapacityError(RuntimeError):
    pass


class EphemeralBannerStore:
    def __init__(
        self,
        *,
        pending_dir: Path = PENDING_DIR,
        persistent_dir: Path = BANNER_DIR,
        ttl: int = TTL,
        max_pending: int = DEFAULT_MAX_PENDING_BANNERS,
        max_pending_bytes: int = DEFAULT_MAX_PENDING_BYTES,
        max_persisted: int = DEFAULT_MAX_PERSISTED_BANNERS,
        max_persisted_bytes: int = DEFAULT_MAX_PERSISTED_BYTES,
        start_vacuum: bool = True,
    ) -> None:
        self.pending_dir = Path(pending_dir)
        self.persistent_dir = Path(persistent_dir)
        self.pending_dir.mkdir(exist_ok=True, parents=True)
        self.persistent_dir.mkdir(exist_ok=True, parents=True)
        self.ttl = max(1, int(ttl))
        self.max_pending = max(1, int(max_pending))
        self.max_pending_bytes = max(1, int(max_pending_bytes))
        self.max_persisted = max(1, int(max_persisted))
        self.max_persisted_bytes = max(1, int(max_persisted_bytes))
        self._lock = threading.Lock()
        self._meta: Dict[str, Tuple[float, str]] = {}
        self._orphan_expiry: Dict[str, float] = {}
        self._recover_pending()
        if start_vacuum:
            threading.Thread(target=self._vacuum, daemon=True).start()

    def put(self, png_buf: BytesIO) -> tuple[str, int, str]:
        content = bytes(png_buf.getbuffer())
        if len(content) > self.max_pending_bytes:
            raise BannerStoreCapacityError("Pending banner byte capacity reached.")

        banner_id = uuid.uuid4().hex
        capability = secrets.token_urlsafe(32)
        capability_hash = self._capability_hash(capability)
        expires = self._next_expiry()

        with self._lock:
            self._sweep_locked(time.time())
            count, size_bytes = self._png_usage(self.pending_dir)
            if count >= self.max_pending:
                raise BannerStoreCapacityError("Pending banner count capacity reached.")
            if size_bytes + len(content) > self.max_pending_bytes:
                raise BannerStoreCapacityError("Pending banner byte capacity reached.")

            png_temp = self.pending_dir / f".{banner_id}.{uuid.uuid4().hex}.png.tmp"
            try:
                png_temp.write_bytes(content)
                self._write_metadata(banner_id, expires, capability_hash, len(content))
                os.replace(png_temp, self._pending_path(banner_id))
            except Exception:
                png_temp.unlink(missing_ok=True)
                self._metadata_path(banner_id).unlink(missing_ok=True)
                raise
            self._meta[banner_id] = (expires, capability_hash)

        return banner_id, expires, capability

    def get(self, banner_id: str) -> Optional[Path]:
        if not self._valid_id(banner_id):
            return None
        with self._lock:
            record = self._meta.get(banner_id)
            if not record:
                return None
            if record[0] < time.time():
                self._delete_pending_locked(banner_id)
                return None
            path = self._pending_path(banner_id)
            if not path.is_file():
                self._delete_pending_locked(banner_id)
                return None
            return path

    def refresh(self, banner_id: str, capability: str) -> Optional[int]:
        with self._lock:
            if not self._is_authorized(banner_id, capability) or self._is_expired(banner_id):
                self._delete_if_expired_locked(banner_id)
                return None
            expires = self._next_expiry()
            _, capability_hash = self._meta[banner_id]
            self._write_metadata(banner_id, expires, capability_hash, self._pending_size(banner_id))
            self._meta[banner_id] = (expires, capability_hash)
            return expires

    def refresh_many(self, records: list[tuple[str, str]]) -> tuple[list[str], int]:
        expires = self._next_expiry()
        refreshed: list[str] = []
        with self._lock:
            for banner_id, capability in records:
                if not self._is_authorized(banner_id, capability) or self._is_expired(banner_id):
                    self._delete_if_expired_locked(banner_id)
                    continue
                _, capability_hash = self._meta[banner_id]
                self._write_metadata(banner_id, expires, capability_hash, self._pending_size(banner_id))
                self._meta[banner_id] = (expires, capability_hash)
                refreshed.append(banner_id)
        return refreshed, expires

    def persist(self, banner_id: str, capability: str) -> Optional[str]:
        with self._lock:
            if not self._is_authorized(banner_id, capability) or self._is_expired(banner_id):
                self._delete_if_expired_locked(banner_id)
                return None
            source = self._pending_path(banner_id)
            if not source.is_file():
                self._delete_pending_locked(banner_id)
                return None

            source_size = source.stat().st_size
            target = self._persistent_path(banner_id)
            count, size_bytes = self._png_usage(self.persistent_dir)
            if not target.exists() and count >= self.max_persisted:
                raise BannerStoreCapacityError("Persistent banner count capacity reached.")
            if not target.exists() and size_bytes + source_size > self.max_persisted_bytes:
                raise BannerStoreCapacityError("Persistent banner byte capacity reached.")

            source.replace(target)
            self._metadata_path(banner_id).unlink(missing_ok=True)
            self._meta.pop(banner_id, None)
            self._orphan_expiry.pop(banner_id, None)
        return f"/bannerbuilder/static/banners/{banner_id}.png"

    def get_persisted_path(self, banner_id: str) -> Optional[Path]:
        if not self._valid_id(banner_id):
            return None
        path = self._persistent_path(banner_id)
        return path if path.is_file() else None

    def release_many(self, records: list[tuple[str, str]]) -> list[str]:
        with self._lock:
            releasable = [
                banner_id
                for banner_id, capability in records
                if self._is_authorized(banner_id, capability) and not self._is_expired(banner_id)
            ]
            for banner_id in releasable:
                self._delete_pending_locked(banner_id)
        return releasable

    def sweep(self) -> list[str]:
        with self._lock:
            return self._sweep_locked(time.time())

    def _next_expiry(self) -> int:
        return int(time.time()) + self.ttl

    def _pending_path(self, banner_id: str) -> Path:
        return self.pending_dir / f"{banner_id}.png"

    def _metadata_path(self, banner_id: str) -> Path:
        return self.pending_dir / f"{banner_id}.json"

    def _persistent_path(self, banner_id: str) -> Path:
        return self.persistent_dir / f"{banner_id}.png"

    @staticmethod
    def _png_usage(directory: Path) -> tuple[int, int]:
        count = 0
        size_bytes = 0
        for path in directory.glob("*.png"):
            try:
                if path.is_file():
                    count += 1
                    size_bytes += path.stat().st_size
            except OSError:
                continue
        return count, size_bytes

    def _pending_size(self, banner_id: str) -> int:
        try:
            return self._pending_path(banner_id).stat().st_size
        except OSError:
            return 0

    @staticmethod
    def _valid_id(banner_id: str) -> bool:
        value = str(banner_id or "")
        return len(value) == 32 and value == value.lower() and all(char in "0123456789abcdef" for char in value)

    @staticmethod
    def _capability_hash(capability: str) -> str:
        return hashlib.sha256(str(capability or "").encode("utf-8")).hexdigest()

    def _is_authorized(self, banner_id: str, capability: str) -> bool:
        record = self._meta.get(banner_id)
        if not record or not capability:
            return False
        return hmac.compare_digest(record[1], self._capability_hash(capability))

    def _is_expired(self, banner_id: str) -> bool:
        record = self._meta.get(banner_id)
        return bool(record and record[0] < time.time())

    def _delete_if_expired_locked(self, banner_id: str) -> None:
        if self._is_expired(banner_id):
            self._delete_pending_locked(banner_id)

    def _delete_pending_locked(self, banner_id: str) -> None:
        self._pending_path(banner_id).unlink(missing_ok=True)
        self._metadata_path(banner_id).unlink(missing_ok=True)
        self._meta.pop(banner_id, None)
        self._orphan_expiry.pop(banner_id, None)

    def _write_metadata(self, banner_id: str, expires: float, capability_hash: str, size_bytes: int) -> None:
        target = self._metadata_path(banner_id)
        temp = self.pending_dir / f".{banner_id}.{uuid.uuid4().hex}.json.tmp"
        payload = {
            "version": 1,
            "expires": int(expires),
            "capabilityHash": capability_hash,
            "sizeBytes": max(0, int(size_bytes)),
        }
        try:
            temp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)

    def _read_metadata(self, banner_id: str) -> Optional[Tuple[float, str]]:
        try:
            payload = json.loads(self._metadata_path(banner_id).read_text(encoding="utf-8"))
            expires = float(payload["expires"])
            capability_hash = str(payload["capabilityHash"])
            if len(capability_hash) != 64 or any(char not in "0123456789abcdef" for char in capability_hash):
                return None
            return expires, capability_hash
        except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
            return None

    def _recover_pending(self) -> None:
        now = time.time()
        with self._lock:
            for temp in self.pending_dir.glob(".*.tmp"):
                temp.unlink(missing_ok=True)

            png_ids: set[str] = set()
            for png_path in self.pending_dir.glob("*.png"):
                banner_id = png_path.stem
                if not self._valid_id(banner_id):
                    png_path.unlink(missing_ok=True)
                    continue
                png_ids.add(banner_id)
                record = self._read_metadata(banner_id)
                if record and record[0] >= now:
                    self._meta[banner_id] = record
                    continue

                if record:
                    self._delete_pending_locked(banner_id)
                    continue

                try:
                    fallback_expiry = png_path.stat().st_mtime + self.ttl
                except OSError:
                    continue
                if fallback_expiry < now:
                    self._delete_pending_locked(banner_id)
                else:
                    self._metadata_path(banner_id).unlink(missing_ok=True)
                    self._orphan_expiry[banner_id] = fallback_expiry

            for metadata_path in self.pending_dir.glob("*.json"):
                if metadata_path.stem not in png_ids:
                    metadata_path.unlink(missing_ok=True)

            self._sweep_locked(now)
            self._trim_recovered_to_capacity_locked()

    def _sweep_locked(self, now: float) -> list[str]:
        expired = [banner_id for banner_id, (expiry, _) in self._meta.items() if expiry < now]
        expired.extend(banner_id for banner_id, expiry in self._orphan_expiry.items() if expiry < now)
        removed = list(dict.fromkeys(expired))
        for banner_id in removed:
            self._delete_pending_locked(banner_id)
        return removed

    def _trim_recovered_to_capacity_locked(self) -> None:
        candidates = []
        for png_path in self.pending_dir.glob("*.png"):
            try:
                candidates.append((png_path.stat().st_mtime, png_path.stem, png_path.stat().st_size))
            except OSError:
                continue
        candidates.sort()
        count = len(candidates)
        size_bytes = sum(item[2] for item in candidates)
        for _, banner_id, item_size in candidates:
            if count <= self.max_pending and size_bytes <= self.max_pending_bytes:
                break
            self._delete_pending_locked(banner_id)
            count -= 1
            size_bytes -= item_size

    def _vacuum(self) -> None:
        while True:
            time.sleep(min(60, self.ttl))
            self.sweep()


def _positive_env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, default)))
    except ValueError:
        return default


STORE = EphemeralBannerStore(
    max_pending=_positive_env_int("BANNERBUILDER_MAX_PENDING", DEFAULT_MAX_PENDING_BANNERS),
    max_pending_bytes=_positive_env_int("BANNERBUILDER_MAX_PENDING_BYTES", DEFAULT_MAX_PENDING_BYTES),
    max_persisted=_positive_env_int("BANNERBUILDER_MAX_PERSISTED", DEFAULT_MAX_PERSISTED_BANNERS),
    max_persisted_bytes=_positive_env_int("BANNERBUILDER_MAX_PERSISTED_BYTES", DEFAULT_MAX_PERSISTED_BYTES),
)
