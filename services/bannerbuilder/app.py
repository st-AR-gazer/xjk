from __future__ import annotations
from pathlib import Path
import os, secrets

from flask import Flask, abort, render_template, render_template_string, send_file, send_from_directory
from dotenv import load_dotenv

from flask_wtf.csrf import generate_csrf
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()

from api import api_bp
from api.dashmap import dashmap_status
from api.store import STORE
from admin import admin_bp
from banner_builder import get_default_background_key, list_background_options
from extensions import csrf, limiter

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent.parent
PUBLIC_DIR = REPO_ROOT / "sites" / "altered.xjk.yt" / "frontend" / "bannerbuilder"
ASSET_DIR = PUBLIC_DIR / "assets"
STATIC_DIR = PUBLIC_DIR / "static"
FAVICON_PATH = PUBLIC_DIR.parent / "favicon.svg"
BUILDER_TEMPLATE_PATH = PUBLIC_DIR / "index.html"


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _secret_key() -> str:
    configured = (os.getenv("SECRET_KEY") or "").strip()
    if configured:
        return configured
    if _env_flag("BANNERBUILDER_ALLOW_EPHEMERAL_SECRET"):
        return secrets.token_hex(32)
    raise RuntimeError(
        "SECRET_KEY is required; set BANNERBUILDER_ALLOW_EPHEMERAL_SECRET=1 only for local development."
    )

def _render_builder():
    return render_template_string(
        BUILDER_TEMPLATE_PATH.read_text(encoding="utf-8"),
        background_options=list_background_options(),
        default_background=get_default_background_key(),
        dashmap=dashmap_status(),
    )


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=BASE_DIR / "templates",
        static_folder=STATIC_DIR,
    )

    app.secret_key = _secret_key()

    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=_env_flag("BANNERBUILDER_COOKIE_SECURE", True),
        SESSION_COOKIE_SAMESITE="Strict",
    )

    csrf.init_app(app)
    limiter.init_app(app)

    if os.getenv("TRUST_PROXY"):
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

    @app.context_processor
    def inject_csrf():
        return dict(csrf_token=(lambda: generate_csrf()))

    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(api_bp, url_prefix="/bannerbuilder/api", name="bannerbuilder_api")
    app.register_blueprint(admin_bp)
    app.register_blueprint(admin_bp, url_prefix="/bannerbuilder", name="bannerbuilder_admin")
    csrf.exempt(api_bp)

    @app.route("/")
    def index():
        return _render_builder()

    @app.route("/bannerbuilder/")
    def bannerbuilder_index():
        return _render_builder()

    @app.route("/favicon.ico")
    @app.route("/bannerbuilder/favicon.ico")
    def favicon():
        return send_from_directory(FAVICON_PATH.parent, FAVICON_PATH.name, conditional=True)

    @app.route("/health")
    def health():
        return "ok"

    @app.route("/bannerbuilder/static/<path:filename>")
    def bannerbuilder_static(filename):
        return send_from_directory(STATIC_DIR, filename, conditional=True)

    @app.route("/static/banners/<banner_id>.png")
    @app.route("/bannerbuilder/static/banners/<banner_id>.png")
    def persisted_banner(banner_id):
        path = STORE.get_persisted_path(banner_id)
        if path is None:
            abort(404)
        return send_file(path, mimetype="image/png", conditional=True)

    @app.route("/assets/<path:filename>")
    @app.route("/bannerbuilder/assets/<path:filename>")
    def asset_files(filename):
        return send_from_directory(ASSET_DIR, filename, conditional=True)

    return app


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "3050"))
    debug = str(os.getenv("FLASK_DEBUG", "0")).strip().lower() in {"1", "true", "yes", "on"}
    create_app().run(host, port=port, debug=debug)
