from slowapi import Limiter
from slowapi.util import get_remote_address

# Default read ceiling; write endpoints also enforce app-level daily quotas.
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
