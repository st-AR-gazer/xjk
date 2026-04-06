from __future__ import annotations
import os, logging, re
from pathlib import Path
from urllib.parse import urlencode, urlparse
from datetime import datetime, timezone, timedelta
from hashlib import sha256
from email.utils import parsedate_to_datetime
from functools import wraps
from collections import Counter

import requests
from flask import (
    Blueprint,
    render_template,
    request,
    redirect,
    url_for,
    flash,
    session,
    jsonify,
)

from werkzeug.security import check_password_hash

from api.dashmap import API_BASE, API_KEY, USER, logger
from .stats import get_stats

ADMIN_PWHASH = os.getenv("ADMIN_PWHASH")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

DOWNLOAD = "https://download.dashmap.live"

admin_bp = Blueprint("admin", __name__, template_folder="templates")
_PUBLIC = {"admin.login", "admin.logout"}

KEY_RX = re.compile(r"^banners_[0-9a-f]{32}\.png$")


def _safe_next(url: str | None) -> str:
    if not url:
        return url_for(".admin")
    u = urlparse(url)
    if u.scheme or u.netloc or not url.startswith("/"):
        return url_for(".admin")
    return url


@admin_bp.before_request
def _require_login():
    if request.endpoint in _PUBLIC or session.get("admin_authed"):
        return
    return redirect(url_for(".login", next=request.path))


def ttl_cache(seconds: int):
    def deco(fn):
        expiry, value = 0, None

        @wraps(fn)
        def wrapper(*a, **k):
            nonlocal expiry, value
            if datetime.now(tz=timezone.utc).timestamp() > expiry:
                value = fn(*a, **k)
                expiry = datetime.now(tz=timezone.utc).timestamp() + seconds
            return value

        return wrapper

    return deco


def _dash_get_files() -> list[str]:
    try:
        r = requests.get(API_BASE, headers={"Authorization": API_KEY}, timeout=10)
    except requests.RequestException as exc:
        logger.error("Dashmap LIST error: %s", exc)
        return []

    if not r.ok:
        logger.error("Dashmap LIST HTTP %s: %s", r.status_code, r.text[:120])
        return []

    raw: list[str] = []

    def add(item):
        if isinstance(item, str):
            raw.append(item)
        elif isinstance(item, dict):
            for k in ("key", "filename", "name"):
                v = item.get(k)
                if isinstance(v, str):
                    raw.append(v)
                    break

    try:
        data = r.json()
    except ValueError:
        data = r.text.splitlines()

    if isinstance(data, list):
        for it in data:
            add(it)
    elif isinstance(data, dict):
        if isinstance(data.get("files"), list):
            for it in data["files"]:
                add(it)
        else:
            for k in data.keys():
                add(k)
    else:
        for it in data:
            add(it)

    return [
        s.split("/", 1)[-1] for s in raw if s.split("/", 1)[-1].startswith("banners_")
    ]


def _dash_head(fname: str) -> tuple[int | None, datetime | None, str]:
    url = f"{DOWNLOAD}/{USER}/{fname}"
    try:
        r = requests.head(url, timeout=6)
        if not r.ok:
            return None, None, sha256(fname.encode()).hexdigest()[:10]
        size = int(r.headers.get("Content-Length", "0"))
        mtime = (
            parsedate_to_datetime(r.headers.get("Last-Modified"))
            if r.headers.get("Last-Modified")
            else None
        )
        return size, mtime, sha256(fname.encode()).hexdigest()[:10]
    except requests.RequestException:
        return None, None, sha256(fname.encode()).hexdigest()[:10]


def _dash_delete(files: list[str]) -> bool:
    qs = "?" + urlencode([("key", f) for f in files])
    r = requests.delete(API_BASE + qs, headers={"Authorization": API_KEY}, timeout=10)
    logger.info("DELETE  %s  → HTTP %s", ",".join(files), r.status_code)
    return r.ok


LOG_PATH = Path(__file__).resolve().parent.parent / "logs" / "dashmap_uploads.log"
_IP_RX = re.compile(r"ip=([\d.:a-fA-F]+)")
_TS_LEN = 19
_TS_FMT = "%Y-%m-%d %H:%M:%S"


def _ip_for(fname: str) -> str | None:
    if not LOG_PATH.exists():
        return None
    with LOG_PATH.open(encoding="utf-8") as fh:
        for line in reversed(fh.readlines()):
            if fname in line:
                m = _IP_RX.search(line)
                if m:
                    return m.group(1)
    return None


def _upload_time(fname: str) -> datetime | None:
    if not LOG_PATH.exists():
        return None
    with LOG_PATH.open(encoding="utf-8") as fh:
        for line in fh:
            if "UPLOAD" in line and fname in line:
                try:
                    ts = datetime.strptime(line[:_TS_LEN], _TS_FMT)
                    return ts.replace(tzinfo=timezone.utc)
                except ValueError:
                    return None
    return None


@ttl_cache(300)
def _dash_list_with_meta() -> list[dict]:
    items = []
    for fname in _dash_get_files():
        size, mtime, sig = _dash_head(fname)
        if mtime is None:
            mtime = _upload_time(fname)

        delta = (datetime.now(tz=timezone.utc) - mtime) if mtime else None
        age = max(0, delta.days) if delta else None

        items.append(
            dict(
                name=fname,
                size_kb=size // 1024 if size else None,
                mtime=mtime.isoformat(timespec="seconds") if mtime else None,
                mtime_disp=mtime.strftime("%d %b %Y %H:%M:%S") if mtime else "—",
                _dt=mtime,
                age=age,
                sig=sig,
                ip=_ip_for(fname),
            )
        )

    items.sort(
        key=lambda rec: rec["_dt"] or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    for rec in items:
        rec.pop("_dt", None)
    return items


def _abuse_counts(days: int) -> list[dict]:
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    ctr: Counter[str] = Counter()

    if LOG_PATH.exists():
        with LOG_PATH.open(encoding="utf-8") as fh:
            for line in fh:
                if "UPLOAD" not in line:
                    continue
                try:
                    ts = datetime.strptime(line[:_TS_LEN], _TS_FMT).replace(
                        tzinfo=timezone.utc
                    )
                except ValueError:
                    continue
                if ts < cutoff:
                    continue
                m = _IP_RX.search(line)
                if m:
                    ctr[m.group(1)] += 1

    return [{"ip": ip, "count": cnt} for ip, cnt in ctr.most_common()]


@admin_bp.after_request
def _admin_security_headers(resp):
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=()")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "img-src 'self' https://download.dashmap.live data:; "
        "script-src 'self' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; "
        "frame-ancestors 'none';",
    )
    return resp


@admin_bp.route("/admin/login", methods=["GET", "POST"])
def login():
    if session.get("admin_authed"):
        return redirect(_safe_next(request.args.get("next")))

    if request.method == "POST":
        pw = request.form.get("password", "")
        ok = False
        if ADMIN_PWHASH:
            ok = check_password_hash(ADMIN_PWHASH, pw)
        elif ADMIN_PASSWORD:
            ok = pw == ADMIN_PASSWORD

        if ok:
            session.clear()
            session["admin_authed"] = True
            flash("Logged in.", "info")
            return redirect(_safe_next(request.args.get("next")))
        flash("Incorrect password.", "error")
        return redirect(url_for(".login"))

    return render_template("admin_login.html")


@admin_bp.route("/admin/logout", methods=["POST"])
def logout():
    session.pop("admin_authed", None)
    flash("Logged out.", "info")
    return redirect(url_for(".login"))


@admin_bp.route("/admin")
def admin():
    files = _dash_list_with_meta()
    counters, chart = get_stats()
    return render_template(
        "admin_list.html", files=files, counters=counters, chart=chart, USER=USER
    )


@admin_bp.route("/admin/delete", methods=["POST"])
def admin_delete():
    all_files = request.form.getlist("file")
    files = [f for f in all_files if KEY_RX.match(f)]
    if not files:
        flash("No valid files selected.", "warn")
        return redirect(url_for(".admin"))

    ok = _dash_delete(files)
    flash(
        f"Deleted {len(files)} file(s)." if ok else "Deletion failed.",
        "info" if ok else "error",
    )
    return redirect(url_for(".admin"))


@admin_bp.route("/admin/logs")
def admin_logs():
    if not LOG_PATH.exists():
        return "Log file not found.", 404
    with LOG_PATH.open(encoding="utf-8") as fh:
        tail = fh.readlines()[-1000:]
    return "".join(tail), 200, {"Content-Type": "text/plain"}


@admin_bp.route("/admin/abuse")
def abuse_json():
    try:
        days = max(1, min(90, int(request.args.get("days", 30))))
    except ValueError:
        days = 30
    return jsonify(_abuse_counts(days))
