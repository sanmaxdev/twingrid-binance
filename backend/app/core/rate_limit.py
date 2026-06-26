"""Redis-based rate limiter per §13.4."""

from datetime import timedelta

import structlog
from fastapi import HTTPException, Request, status

from app.core.redis_client import redis_client

logger = structlog.get_logger()


class RateLimiter:
    """Sliding-window rate limiter using Redis."""

    def __init__(self, max_requests: int, window: timedelta, key_prefix: str):
        self.max_requests = max_requests
        self.window_seconds = int(window.total_seconds())
        self.key_prefix = key_prefix

    async def check(self, identifier: str) -> bool:
        """Return True if request is allowed, False if rate-limited."""
        import time

        key = f"ratelimit:{self.key_prefix}:{identifier}"
        now = time.time()
        pipe = redis_client.pipeline()
        pipe.zremrangebyscore(key, 0, now - self.window_seconds)
        pipe.zcard(key)
        pipe.zadd(key, {str(now): now})
        pipe.expire(key, self.window_seconds)
        results = await pipe.execute()
        current_count = results[1]
        return current_count < self.max_requests

    async def check_or_raise(self, identifier: str):
        """Raise 429 if rate-limited."""
        allowed = await self.check(identifier)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(self.window_seconds)},
            )


# Pre-configured limiters per §13.4
login_limiter_ip = RateLimiter(max_requests=20, window=timedelta(minutes=15), key_prefix="login_ip")
login_limiter_email = RateLimiter(
    max_requests=10, window=timedelta(minutes=15), key_prefix="login_email"
)
register_limiter_ip = RateLimiter(
    max_requests=3, window=timedelta(hours=1), key_prefix="register_ip"
)
forgot_password_limiter = RateLimiter(
    max_requests=3, window=timedelta(hours=1), key_prefix="forgot_email"
)
resend_verification_limiter = RateLimiter(
    max_requests=3, window=timedelta(hours=1), key_prefix="resend_email"
)
api_limiter_user = RateLimiter(max_requests=100, window=timedelta(minutes=1), key_prefix="api_user")


def get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For behind reverse proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
