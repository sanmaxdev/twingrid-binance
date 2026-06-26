import asyncio
import structlog
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.config import settings
from app.models.account import Account
from app.models.platform_settings import PlatformSettings
from app.core.enums import AccountStatus
from app.services.grid_bot import GridBotService

logger = structlog.get_logger(__name__)


# Module-level DB engine singleton for scheduler tasks
_sched_engine = None
_sched_session_factory = None


def _get_worker_session_factory():
    """Shared async engine + session factory for scheduler tasks.

    Uses NullPool to prevent connection leaks from asyncio.run() creating
    new event loops that orphan pooled connections.
    """
    global _sched_engine, _sched_session_factory
    if _sched_engine is None:
        _sched_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )
        _sched_session_factory = async_sessionmaker(_sched_engine, expire_on_commit=False)
    return _sched_session_factory, _sched_engine


async def _schedule_grid_ticks():
    SessionLocal, engine = _get_worker_session_factory()
    async with SessionLocal() as session:
        # Check master trading switch
        result = await session.execute(
            select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
        )
        setting = result.scalar_one_or_none()
        if not setting or (setting.value is not True and setting.value != "true"):
            logger.debug("Platform trading is DISABLED. Skipping tick scheduling.")
            return

        # Dispatch ticks for RUNNING + auto_trade_enabled accounts
        result = await session.execute(
            select(Account.id).where(
                Account.status == AccountStatus.RUNNING,
                Account.auto_trade_enabled == True,
                Account.deleted_at.is_(None)
            )
        )
        account_ids = result.scalars().all()

        if account_ids:
            logger.info(f"Scheduling grid ticks for {len(account_ids)} active accounts")

        for account_id in account_ids:
            process_account_tick.delay(str(account_id))


@celery_app.task
def schedule_grid_ticks():
    """Called every minute by Celery Beat."""
    try:
        asyncio.run(_schedule_grid_ticks())
    except Exception as e:
        logger.error(f"Error scheduling grid ticks: {e}")


async def _process_account_tick(account_id: str):
    """Run the grid bot for a single account with its own DB engine."""
    try:
        bot = GridBotService(account_id)
        await bot.process_tick()
    except Exception as e:
        logger.error(f"Error processing tick for account {account_id}: {e}")


@celery_app.task
def process_account_tick(account_id: str):
    """Worker task to execute grid logic for a specific account."""
    asyncio.run(_process_account_tick(account_id))


# ── Fast Basket Monitoring (30s) ──

async def _schedule_basket_monitoring():
    """Only dispatch monitoring ticks for accounts with active baskets."""
    SessionLocal, engine = _get_worker_session_factory()
    async with SessionLocal() as session:
        # Check master trading switch
        result = await session.execute(
            select(PlatformSettings).where(PlatformSettings.key == "trading_enabled")
        )
        setting = result.scalar_one_or_none()
        if not setting or (setting.value is not True and setting.value != "true"):
            return

        # Only get accounts that have OPEN baskets
        from app.models.basket import Basket
        result = await session.execute(
            select(Account.id).where(
                Account.status == AccountStatus.RUNNING,
                Account.auto_trade_enabled == True,
                Account.deleted_at.is_(None),
                Account.id.in_(
                    select(Basket.account_id).where(
                        Basket.status.in_(["OPENING", "OPEN", "CLOSING"])
                    )
                )
            )
        )
        account_ids = result.scalars().all()

        if account_ids:
            logger.debug(f"Fast-monitoring {len(account_ids)} accounts with active baskets")

        for account_id in account_ids:
            monitor_account_basket.delay(str(account_id))


@celery_app.task
def schedule_basket_monitoring():
    """Called every 30 seconds by Celery Beat — monitors active baskets only."""
    try:
        asyncio.run(_schedule_basket_monitoring())
    except Exception as e:
        logger.error(f"Error scheduling basket monitoring: {e}")


async def _monitor_account_basket(account_id: str):
    """Monitor-only tick for a single account (no signal evaluation)."""
    try:
        bot = GridBotService(account_id)
        await bot.process_monitor_only()
    except Exception as e:
        logger.error(f"Error monitoring basket for account {account_id}: {e}")


@celery_app.task
def monitor_account_basket(account_id: str):
    """Worker task to monitor basket for a specific account."""
    asyncio.run(_monitor_account_basket(account_id))
