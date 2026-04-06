from __future__ import annotations
import threading, time, uuid
from pathlib import Path
from typing import Dict, Tuple, Optional
from io import BytesIO

TTL = 600

BASE = Path(__file__).resolve().parent.parent
BANNER_DIR = BASE / "static" / "banners"
BANNER_DIR.mkdir(exist_ok=True, parents=True)


class EphemeralBannerStore:
    def __init__(self) -> None:
        self._lock: threading.Lock = threading.Lock()
        self._meta: Dict[str, Tuple[float, bool]] = {}
        t = threading.Thread(target=self._vacuum, daemon=True)
        t.start()

    def put(self, png_buf: BytesIO) -> tuple[str, int]:
        _id = uuid.uuid4().hex
        path = self._path(_id)
        with open(path, "wb") as f:
            f.write(png_buf.getbuffer())

        expires = int(time.time()) + TTL
        with self._lock:
            self._meta[_id] = (expires, False)
        return _id, expires

    def get(self, _id: str) -> Optional[Path]:
        meta = self._meta.get(_id)
        if not meta:
            return None
        expires, permanent = meta
        if not permanent and expires < time.time():
            self._delete(_id)
            return None
        return self._path(_id)

    def refresh(self, _id: str) -> Optional[int]:
        with self._lock:
            if _id not in self._meta:
                return None
            expires, permanent = self._meta[_id]
            if permanent:
                return None
            expires = int(time.time()) + TTL
            self._meta[_id] = (expires, False)
            return expires

    def persist(self, _id: str) -> Optional[str]:
        with self._lock:
            if _id not in self._meta:
                return None
            expires, _ = self._meta[_id]
            self._meta[_id] = (expires, True)
        return f"static/banners/{_id}.png"

    def _path(self, _id: str) -> Path:
        return BANNER_DIR / f"{_id}.png"

    def _delete(self, _id: str) -> None:
        try:
            self._path(_id).unlink(missing_ok=True)
        finally:
            self._meta.pop(_id, None)

    def _vacuum(self) -> None:
        while True:
            time.sleep(60)
            now = time.time()
            dead = []
            with self._lock:
                for _id, (exp, permanent) in self._meta.items():
                    if not permanent and exp < now:
                        dead.append(_id)
            for _id in dead:
                self._delete(_id)


STORE = EphemeralBannerStore()
