import logging
from app.core.logging import setup_logging
import structlog
import asyncio

setup_logging()
logger = structlog.get_logger()

async def main():
    logger.info("scheduler started")
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
