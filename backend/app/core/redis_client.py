import redis.asyncio as redis

from app.core.config import settings

redis_client = redis.from_url(settings.REDIS_URL)


async def check_redis_health() -> bool:
    try:
        await redis_client.ping()
        return True
    except Exception:
        return False
