"""Equity snapshot Celery task — records balance/equity for all running accounts."""

import asyncio
import structlog
from celery import shared_task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import decrypt_secret
from app.models.account import Account
from app.models.equity_snapshot import EquitySnapshot
from app.services.binance_client import BinanceClient
from app.services.binance_ws_manager import ws_cache

logger = structlog.get_logger()

# Module-level DB engine singleton for equity tasks
_eq_engine = None
_eq_session_factory = None


def _get_equity_session():
    """Shared async engine + session factory for equity snapshot tasks.

    Uses NullPool to prevent connection leaks from asyncio.run() creating
    new event loops that orphan pooled connections.
    """
    global _eq_engine, _eq_session_factory
    if _eq_engine is None:
        _eq_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            poolclass=NullPool,
        )
        _eq_session_factory = async_sessionmaker(_eq_engine, expire_on_commit=False)
    return _eq_session_factory, _eq_engine


async def _snapshot_all():
    """Snapshot equity for all running accounts."""
    SessionLocal, engine = _get_equity_session()

    async with SessionLocal() as db:
        result = await db.execute(
            select(Account).where(
                Account.status == "RUNNING",
                Account.deleted_at == None,
            )
        )
        accounts = result.scalars().all()

        for account in accounts:
            try:
                # Cache-first: try WebSocket-cached balances, fallback to REST
                balance = await ws_cache.get_balances(str(account.id))
                if balance is None:
                    api_key = decrypt_secret(account.api_key_encrypted)
                    api_secret = decrypt_secret(account.api_secret_encrypted)
                    client = BinanceClient(
                        api_key=api_key,
                        api_secret=api_secret,
                        is_testnet=account.is_testnet,
                    )
                    balance = await client.get_balances()

                wallet_bal = 0.0
                unrealized = 0.0
                margin = 0.0

                for asset in balance:
                    if asset.get("asset") == "USDT":
                        wallet_bal = float(asset.get("walletBalance", 0) or 0)
                        unrealized = float(asset.get("crossUnPnl", 0) or asset.get("unrealizedProfit", 0) or 0)
                        margin = float(asset.get("maintMargin", 0) or asset.get("initialMargin", 0) or 0)
                        break

                # True equity = wallet balance + unrealized PnL
                equity = wallet_bal + unrealized

                snapshot = EquitySnapshot(
                    account_id=account.id,
                    user_id=account.user_id,
                    wallet_balance=wallet_bal,
                    total_equity=equity,
                    unrealized_pnl=unrealized,
                    margin_used=margin,
                )
                db.add(snapshot)
                logger.debug(
                    "equity_snapshot",
                    account_id=str(account.id),
                    equity=equity,
                )
            except Exception as e:
                logger.error(
                    "equity_snapshot_error",
                    account_id=str(account.id),
                    error=str(e),
                )

        await db.commit()


@shared_task(name="equity_snapshot")
def equity_snapshot():
    """Celery task: snapshot equity for all running accounts."""
    try:
        asyncio.run(_snapshot_all())
    except Exception as e:
        logger.error(f"Error in equity snapshot: {e}")
