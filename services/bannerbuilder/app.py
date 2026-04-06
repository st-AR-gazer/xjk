from __future__ import annotations
from pathlib import Path
import os, secrets

from flask import Flask, render_template, send_from_directory
from dotenv import load_dotenv

from flask_wtf.csrf import CSRFProtect, generate_csrf
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv()

from api import api_bp
from api.dashmap import dashmap_status
from admin import admin_bp
from banner_builder import get_default_background_key, list_background_options

BASE_DIR = Path(__file__).resolve().parent
ASSET_DIR = BASE_DIR / "assets"
SPIN_DIR = BASE_DIR / "spinning_dodecahedron"
STATIC_DIR = BASE_DIR / "static"

csrf = CSRFProtect()
limiter = Limiter(key_func=get_remote_address)


def _render_builder():
    return render_template(
        "index.html",
        background_options=list_background_options(),
        default_background=get_default_background_key(),
        dashmap=dashmap_status(),
    )


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=BASE_DIR / "templates",
        static_folder=BASE_DIR / "static",
    )

    app.secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)

    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
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
        return send_from_directory(BASE_DIR, "favicon.ico", conditional=True)

    @app.route("/health")
    def health():
        return "ok"

    @app.route("/bannerbuilder/static/<path:filename>")
    def bannerbuilder_static(filename):
        return send_from_directory(STATIC_DIR, filename, conditional=True)

    @app.route("/assets/<path:filename>")
    @app.route("/bannerbuilder/assets/<path:filename>")
    def asset_files(filename):
        return send_from_directory(ASSET_DIR, filename, conditional=True)

    @app.route("/spinning_dodecahedron/<path:filename>")
    def spinning_dodeca(filename):
        return send_from_directory(SPIN_DIR, filename, conditional=True)

    @app.route("/bannerbuilder/spinning/<path:filename>")
    def spinning(filename):
        return send_from_directory(SPIN_DIR, filename, conditional=True)

    return app


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "3050"))
    debug = str(os.getenv("FLASK_DEBUG", "0")).strip().lower() in {"1", "true", "yes", "on"}
    create_app().run(host, port=port, debug=debug)
