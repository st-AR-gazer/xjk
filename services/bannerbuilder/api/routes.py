"""
* /banner                        - legacy direct-PNG response
* /banners (POST)                - JSON workflow (returns id, url, expiry, capability)
* /banners/<id>.png (GET)        - fetch stored PNG
* /banners/refresh (POST)        - refresh multiple active banners
* /banners/release (POST)        - release multiple active banners
* /banners/<id>/refresh (POST)   - push TTL forward another 10 min
* /banners/<id>/persist (POST)   - mark banner permanent with its capability
"""

from io import BytesIO

from flask import abort, current_app, jsonify, request, send_file

from . import api_bp
from .store import STORE, BannerStoreCapacityError
from banner_builder import generate_banner
from extensions import GENERATION_RATE_LIMIT, PERSIST_RATE_LIMIT, limiter


def _extract_banner_records() -> list[tuple[str, str]]:
    payload = request.get_json(silent=True)
    raw_records = payload.get("banners") if isinstance(payload, dict) else None
    if not isinstance(raw_records, list):
        return []

    cleaned: list[tuple[str, str]] = []
    for candidate in raw_records:
        if not isinstance(candidate, dict):
            continue
        banner_id = str(candidate.get("id") or "").strip()
        capability = str(candidate.get("capability") or "").strip()
        if not banner_id.isalnum() or not capability:
            continue
        cleaned.append((banner_id, capability))
    return cleaned


def _request_capability() -> str:
    payload = request.get_json(silent=True)
    if isinstance(payload, dict):
        value = payload.get("capability")
        if value:
            return str(value).strip()
    return str(request.headers.get("X-Banner-Capability") or "").strip()


@api_bp.route("/banner", methods=["GET", "POST"])
@limiter.limit(GENERATION_RATE_LIMIT)
def banner_legacy():
    data = request.json if request.is_json else request.values.to_dict()

    try:
        png: BytesIO = generate_banner(data)
    except FileNotFoundError as e:
        abort(400, str(e))
    except Exception:
        current_app.logger.exception("Banner generation failed")
        abort(500, "Internal banner generator error.")

    return send_file(png, mimetype="image/png", download_name="banner.png")


@api_bp.route("/banners", methods=["POST"])
@limiter.limit(GENERATION_RATE_LIMIT)
def make_banner():
    data = request.get_json(force=True, silent=True) or {}

    try:
        png: BytesIO = generate_banner(data)
    except FileNotFoundError as e:
        abort(400, str(e))
    except Exception:
        current_app.logger.exception("Banner generation failed")
        abort(500, "Internal banner generator error.")

    try:
        banner_id, expires, capability = STORE.put(png)
    except BannerStoreCapacityError as error:
        abort(507, str(error))
    url = f"api/banners/{banner_id}.png"
    return jsonify(id=banner_id, url=url, expires=expires, capability=capability)


@api_bp.route("/banners/<banner_id>.png", methods=["GET"])
def get_banner(banner_id: str):
    buf = STORE.get(banner_id)
    if buf is None:
        abort(404, "banner expired")

    resp = send_file(buf, mimetype="image/png", download_name=f"{banner_id}.png")
    resp.expires = 0
    return resp


@api_bp.route("/banners/<banner_id>/refresh", methods=["POST"])
def refresh_banner(banner_id: str):
    new_exp = STORE.refresh(banner_id, _request_capability())
    if new_exp is None:
        abort(404, "banner not found or already permanent")
    return jsonify(id=banner_id, expires=new_exp)


@api_bp.route("/banners/refresh", methods=["POST"])
def refresh_banners():
    records = _extract_banner_records()
    refreshed, expires = STORE.refresh_many(records)
    return jsonify(ids=refreshed, expires=expires)


@api_bp.route("/banners/release", methods=["POST"])
def release_banners():
    records = _extract_banner_records()
    released = STORE.release_many(records)
    return jsonify(released=released)


@api_bp.route("/banners/<banner_id>/persist", methods=["POST"])
@limiter.limit(PERSIST_RATE_LIMIT)
def persist_banner(banner_id: str):
    try:
        url = STORE.persist(banner_id, _request_capability())
    except BannerStoreCapacityError as error:
        abort(507, str(error))
    if url is None:
        abort(404, "banner not found")
    return jsonify(id=banner_id, url=url)
