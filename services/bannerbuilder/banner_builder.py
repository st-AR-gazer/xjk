from __future__ import annotations
from io import BytesIO
from pathlib import Path
from typing import Mapping
import PIL
from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent
REPO_ROOT = BASE.parent.parent
ASSETS = REPO_ROOT / "sites" / "altered.xjk.yt" / "frontend" / "bannerbuilder" / "assets"
BG_DIR = ASSETS / "backgrounds"
SOLID_DIR = ASSETS / "solids"
FONT_DIR = ASSETS / "fonts"

CANVAS_W, CANVAS_H = 1600, 200
DEFAULT_ORDER = ["dodecahedron", "tetrahedron", "octahedron", "icosahedron"]
SPOT_POSITIONS = [
    (20, 10),  # slot 0 -> dodecahedron
    (200, 10),  # slot 1 -> tetrahedron
    (1200, 10),  # slot 2 -> octahedron
    (1400, 10),  # slot 3 -> icosahedron
]
DEFAULT_SOLID_SIZE = (120, 120)

PREFERRED_BACKGROUND_ORDER = [
    "winter",
    "spring",
    "summer",
    "fall",
    "other",
    "training",
]

SOLID_MAP = {p.stem.lower(): p for p in SOLID_DIR.glob("*.png")}
ALL_SOLIDS = sorted(
    SOLID_MAP.keys()
)

MAX_DIM = 2048
MAX_FS = 400
MAX_TXT = 256
MAX_ROT = 360.0


def get_background_map() -> dict[str, Path]:
    return {
        path.stem.lower(): path
        for path in sorted(BG_DIR.glob("*.png"), key=lambda candidate: candidate.stem.lower())
    }


def list_background_options() -> list[dict[str, str]]:
    background_map = get_background_map()
    preferred = [key for key in PREFERRED_BACKGROUND_ORDER if key in background_map]
    extras = sorted(key for key in background_map.keys() if key not in preferred)
    ordered = preferred + extras
    return [
        {
            "value": key,
            "label": key.replace("_", " ").replace("-", " ").title(),
        }
        for key in ordered
    ]


def get_default_background_key() -> str:
    background_map = get_background_map()
    if "winter" in background_map:
        return "winter"
    if "other" in background_map:
        return "other"
    for key in background_map.keys():
        return key
    raise FileNotFoundError("No background images are available")


def _int(v, fb):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return fb


def _float(v, fb):
    try:
        return float(v)
    except (TypeError, ValueError):
        return fb


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _clampf(v, lo, hi):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, v))


def _load_font(pt: int) -> ImageFont.ImageFont:
    for cand in ("AlteredCarbon.ttf", "Altered Carbon V2.ttf"):
        p = FONT_DIR / cand
        if p.exists():
            try:
                return ImageFont.truetype(str(p), pt)
            except OSError:
                pass
    try:
        fallback = Path(PIL.__path__[0]) / "fonts" / "DejaVuSans.ttf"
        return ImageFont.truetype(str(fallback), pt)
    except OSError:
        return ImageFont.load_default()


def generate_banner(data: Mapping[str, str]) -> BytesIO:
    background_map = get_background_map()
    bg_key = (data.get("bg", "other") or "other").lower()
    bg_path = background_map.get(bg_key) or background_map.get("other")
    if not bg_path:
        raise FileNotFoundError("No background images are available")
    bg = Image.open(bg_path).convert("RGBA")
    if bg.size != (CANVAS_W, CANVAS_H):
        bg = bg.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)

    canvas = bg.copy()
    draw = ImageDraw.Draw(canvas)

    raw = [x.strip().lower() for x in (data.get("order") or "").split(",")]
    slots = (raw + ["", "", "", ""])[:4]

    for idx, solid in enumerate(slots):
        if solid not in ALL_SOLIDS:
            continue

        x = _clamp(
            _int(data.get(f"{solid}_x"), SPOT_POSITIONS[idx][0]), -CANVAS_W, CANVAS_W
        )
        y = _clamp(
            _int(data.get(f"{solid}_y"), SPOT_POSITIONS[idx][1]), -CANVAS_H, CANVAS_H
        )
        w = _clamp(_int(data.get(f"{solid}_w"), DEFAULT_SOLID_SIZE[0]), 0, MAX_DIM)
        h = _clamp(_int(data.get(f"{solid}_h"), DEFAULT_SOLID_SIZE[1]), 0, MAX_DIM)
        r = _clampf(data.get(f"{solid}_rot"), -MAX_ROT, MAX_ROT)

        fp = SOLID_MAP.get(solid)
        if not fp or not fp.exists():
            continue

        icon = (
            Image.open(fp)
            .convert("RGBA")
            .resize((w, h), Image.LANCZOS)
            .rotate(-r, expand=True, resample=Image.BICUBIC)
        )
        canvas.alpha_composite(icon, (x, y))

    main_txt = (data.get("main", "1:23:45.678") or "")[:MAX_TXT]
    sub_txt = (data.get("sub", "") or "")[:MAX_TXT]
    main_fs = _clamp(_int(data.get("main_fs"), 135), 8, MAX_FS)
    sub_fs = _clamp(_int(data.get("sub_fs"), 36), 8, MAX_FS)
    main_r = _clampf(data.get("main_rot"), -MAX_ROT, MAX_ROT)
    sub_r = _clampf(data.get("sub_rot"), -MAX_ROT, MAX_ROT)
    f_main, f_sub = _load_font(main_fs), _load_font(sub_fs)

    def blit(
        txt: str, font: ImageFont.ImageFont, xy: tuple[int, int], rot_deg: float
    ) -> None:
        if not txt:
            return
        bbox = draw.textbbox((0, 0), txt, font=font)
        x0, y0, x1, y1 = bbox
        w = x1 - x0 + 10
        h = y1 - y0 + 10

        tmp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        tdr = ImageDraw.Draw(tmp)
        origin = (-x0 + 5, -y0 + 5)
        tdr.text((origin[0] + 2, origin[1] + 2), txt, font=font, fill=(0, 0, 0, 160))
        tdr.text(origin, txt, font=font, fill=(255, 255, 255, 255))
        tmp = tmp.rotate(-rot_deg, expand=True, resample=Image.BICUBIC)
        canvas.alpha_composite(tmp, xy)

    m_box = draw.textbbox((0, 0), main_txt, font=f_main)
    main_w = m_box[2] - m_box[0]
    main_h = m_box[3] - m_box[1]
    main_x = _clamp(
        _int(data.get("main_x"), int((CANVAS_W - main_w) // 2)), -CANVAS_W, CANVAS_W
    )
    main_y = _clamp(
        _int(data.get("main_y"), int((CANVAS_H - main_h) // 2)), -CANVAS_H, CANVAS_H
    )
    blit(main_txt, f_main, (main_x, main_y), main_r)

    if sub_txt:
        s_box = draw.textbbox((0, 0), sub_txt, font=f_sub)
        sub_w = s_box[2] - s_box[0]
        sub_h = s_box[3] - s_box[1]
        sub_x = _clamp(
            _int(data.get("sub_x"), int((CANVAS_W - sub_w) // 2)), -CANVAS_W, CANVAS_W
        )
        sub_y = _clamp(
            _int(data.get("sub_y"), int(main_y + main_h + 6)), -CANVAS_H, CANVAS_H
        )
        blit(sub_txt, f_sub, (sub_x, sub_y), sub_r)

    buf = BytesIO()
    canvas.save(buf, "PNG")
    buf.seek(0)
    return buf
