import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect()
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[os.getenv("BANNERBUILDER_RATE_LIMIT", "120 per minute")],
    storage_uri=os.getenv("BANNERBUILDER_RATE_LIMIT_STORAGE_URI", "memory://"),
)

GENERATION_RATE_LIMIT = os.getenv("BANNERBUILDER_GENERATION_RATE_LIMIT", "30 per minute")
PERSIST_RATE_LIMIT = os.getenv("BANNERBUILDER_PERSIST_RATE_LIMIT", "10 per minute")
