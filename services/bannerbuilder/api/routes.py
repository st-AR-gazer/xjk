"""
* /banner                      - legacy direct-PNG response
* /banners (POST)              - JSON workflow (returns id, url, expires)
* /banners/<id>.png (GET)      - fetch stored PNG (10-min TTL)
* /banners/<id>/refresh (POST) - push TTL forward another 10 min
* /banners/<id>/persist (POST) - mark banner permanent & return static URL
"""

from io import BytesIO
from flask import request, jsonify, send_file, abort, current_app

from . import api_bp
from banner_builder import generate_banner
from .store import STORE


@api_bp.route("/banner", methods=["GET", "POST"])
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
def make_banner():
    data = request.get_json(force=True, silent=True) or {}

    try:
        png: BytesIO = generate_banner(data)
    except FileNotFoundError as e:
        abort(400, str(e))
    except Exception:
        current_app.logger.exception("Banner generation failed")
        abort(500, "Internal banner generator error.")

    banner_id, expires = STORE.put(png)
    url = f"api/banners/{banner_id}.png"
    return jsonify(id=banner_id, url=url, expires=expires)


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
    new_exp = STORE.refresh(banner_id)
    if new_exp is None:
        abort(404, "banner not found or already permanent")
    return jsonify(id=banner_id, expires=new_exp)


@api_bp.route("/banners/<banner_id>/persist", methods=["POST"])
def persist_banner(banner_id: str):
    url = STORE.persist(banner_id)
    if url is None:
        abort(404, "banner not found")
    return jsonify(id=banner_id, url=url)
