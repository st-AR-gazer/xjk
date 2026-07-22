from __future__ import annotations
import os, logging, time
from pathlib import Path
from typing import Optional

import requests
from flask import jsonify, abort, request

from . import api_bp
from .store import STORE, BannerStoreCapacityError
from extensions import PERSIST_RATE_LIMIT, limiter


LOG_PATH = Path(__file__).resolve().parent.parent / "logs" / "dashmap_uploads.log"
LOG_PATH.parent.mkdir(exist_ok=True)

logger = logging.getLogger("dashmap")
logger.setLevel(logging.INFO)
if not logger.handlers:
    fh = logging.FileHandler(LOG_PATH, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s  %(levelname)s  %(message)s"))
    logger.addHandler(fh)


API_BASE = "https://api.dashmap.live/"
DOWNLOAD = "https://download.dashmap.live"
API_KEY = (os.getenv("DASHMAP_API_KEY") or "").strip()
USER = (os.getenv("DASHMAP_USER") or "").strip()
DASHMAP_DISABLED_MESSAGE = "Dashmap upload is unavailable on this server."

if not API_KEY or not USER:
    logger.error("DASHMAP_API_KEY or DASHMAP_USER not set - Dashmap uploads disabled.")


def dashmap_enabled() -> bool:
    return bool(API_KEY and USER)


def dashmap_status() -> dict[str, str | bool]:
    enabled = dashmap_enabled()
    return {
        "enabled": enabled,
        "message": "" if enabled else DASHMAP_DISABLED_MESSAGE,
    }


def _upload(
    path: Path, remote_name: str, client_ip: str | None = None
) -> Optional[str]:
    with path.open("rb") as fh:
        resp = requests.put(
            API_BASE,
            headers={"Authorization": API_KEY},
            files=[(remote_name, fh)],
            timeout=15,
        )
    ok = resp.status_code in (200, 201, 204)
    logger.info(
        "UPLOAD  %s -> %s  [%s] %s  ip=%s",
        path.name,
        remote_name,
        resp.status_code,
        resp.text.strip()[:120],
        client_ip or "-",
    )
    if not ok:
        return None
    return f"{DOWNLOAD}/{USER}/{remote_name}"


@api_bp.route("/banners/<banner_id>/dashmap", methods=["POST"])
@limiter.limit(PERSIST_RATE_LIMIT)
def dashmap_upload(banner_id: str):
    if not dashmap_enabled():
        return jsonify(
            error=DASHMAP_DISABLED_MESSAGE,
            code="dashmap_not_configured",
        ), 503

    payload = request.get_json(silent=True) or {}
    capability = str(payload.get("capability") or request.headers.get("X-Banner-Capability") or "").strip()
    try:
        url = STORE.persist(banner_id, capability)
    except BannerStoreCapacityError as error:
        abort(507, str(error))
    if url is None:
        abort(404, "banner not found")

    path = STORE.get_persisted_path(banner_id)
    if path is None or not path.exists():
        abort(500, "local banner file missing")

    route = request.access_route or []
    client_ip = (route[-1] if route else request.remote_addr or "").strip()

    remote_name = f"banners_{banner_id}.png"
    dash_url = _upload(path, remote_name, client_ip)
    if dash_url is None:
        abort(502, "Dashmap upload failed - see server logs")

    return jsonify(id=banner_id, dashmap_url=dash_url)
