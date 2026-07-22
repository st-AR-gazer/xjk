from io import BytesIO
import os
from pathlib import Path
import shutil
from tempfile import gettempdir
import time
from unittest import TestCase
import uuid

from api.store import BannerStoreCapacityError, EphemeralBannerStore


def create_store(tmp_path: Path, *, max_persisted: int = 2, **kwargs) -> EphemeralBannerStore:
    return EphemeralBannerStore(
        pending_dir=tmp_path / "pending",
        persistent_dir=tmp_path / "persisted",
        ttl=60,
        max_persisted=max_persisted,
        start_vacuum=False,
        **kwargs,
    )


def put_banner(store: EphemeralBannerStore) -> tuple[str, int, str]:
    return store.put(BytesIO(b"png-data"))


class EphemeralBannerStoreTest(TestCase):
    def setUp(self) -> None:
        self.root = Path(gettempdir()) / f"bannerbuilder-store-{uuid.uuid4().hex}"
        self.root.mkdir(parents=True)

    def tearDown(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def test_pending_banner_requires_its_capability(self) -> None:
        store = create_store(self.root)
        banner_id, expires, capability = put_banner(store)

        self.assertGreater(expires, 0)
        self.assertEqual(store.get(banner_id).read_bytes(), b"png-data")
        self.assertIsNone(store.refresh(banner_id, "wrong"))
        self.assertGreaterEqual(store.refresh(banner_id, capability), expires)
        self.assertEqual(store.release_many([(banner_id, "wrong")]), [])
        self.assertIsNotNone(store.get(banner_id))

        self.assertEqual(store.release_many([(banner_id, capability)]), [banner_id])
        self.assertIsNone(store.get(banner_id))

    def test_persist_moves_banner_out_of_pending_storage(self) -> None:
        store = create_store(self.root)
        banner_id, _, capability = put_banner(store)

        self.assertIsNone(store.persist(banner_id, "wrong"))
        self.assertEqual(
            store.persist(banner_id, capability),
            f"/bannerbuilder/static/banners/{banner_id}.png",
        )
        self.assertIsNone(store.get(banner_id))
        self.assertEqual(store.get_persisted_path(banner_id).read_bytes(), b"png-data")
        self.assertEqual(list((self.root / "pending").glob("*.png")), [])

    def test_persist_enforces_configured_capacity(self) -> None:
        store = create_store(self.root, max_persisted=1)
        first_id, _, first_capability = put_banner(store)
        second_id, _, second_capability = put_banner(store)

        self.assertTrue(store.persist(first_id, first_capability))
        with self.assertRaises(BannerStoreCapacityError):
            store.persist(second_id, second_capability)

        self.assertIsNotNone(store.get(second_id))

    def test_restart_recovers_live_pending_banner_and_sweeps_stale_orphan(self) -> None:
        first = create_store(self.root)
        banner_id, _, capability = put_banner(first)

        recovered = create_store(self.root)
        self.assertEqual(recovered.get(banner_id).read_bytes(), b"png-data")
        self.assertIsNotNone(recovered.refresh(banner_id, capability))

        orphan_id, _, _ = put_banner(recovered)
        orphan_png = self.root / "pending" / f"{orphan_id}.png"
        (self.root / "pending" / f"{orphan_id}.json").unlink()
        stale_time = time.time() - 120
        os.utime(orphan_png, (stale_time, stale_time))

        restarted = create_store(self.root)
        self.assertFalse(orphan_png.exists())
        self.assertIsNotNone(restarted.get(banner_id))

    def test_pending_count_and_byte_capacity_are_enforced(self) -> None:
        count_limited = create_store(self.root / "count", max_pending=1)
        put_banner(count_limited)
        with self.assertRaises(BannerStoreCapacityError):
            put_banner(count_limited)

        byte_limited = create_store(self.root / "bytes", max_pending_bytes=7)
        with self.assertRaises(BannerStoreCapacityError):
            put_banner(byte_limited)

    def test_persisted_byte_capacity_is_enforced(self) -> None:
        store = create_store(self.root, max_persisted_bytes=7)
        banner_id, _, capability = put_banner(store)

        with self.assertRaises(BannerStoreCapacityError):
            store.persist(banner_id, capability)
        self.assertIsNotNone(store.get(banner_id))
