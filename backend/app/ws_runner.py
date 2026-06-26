"""WebSocket Manager entry point.

Runs as a standalone long-lived process (Docker service: ws_manager).
Maintains persistent Binance WebSocket User Data Streams for all active accounts.

Usage:
    python -m app.ws_runner
"""

import asyncio
import signal
import structlog
from app.core.logging import setup_logging
from app.services.binance_ws_manager import BinanceWSManager

setup_logging()
logger = structlog.get_logger(__name__)


async def main():
    manager = BinanceWSManager()

    # Graceful shutdown on SIGTERM/SIGINT
    loop = asyncio.get_running_loop()

    def _signal_handler():
        logger.info("ws_runner_signal_received")
        asyncio.create_task(manager.shutdown())

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    logger.info("ws_runner_starting")
    try:
        await manager.run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        await manager.shutdown()
    logger.info("ws_runner_exited")


if __name__ == "__main__":
    asyncio.run(main())
