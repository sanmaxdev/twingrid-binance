"""Reconciler — syncs DB state with Binance on worker startup per §5.5."""

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.account import Account
from app.models.basket import Basket
from app.services.binance_client import BinanceClient
from app.core.security import decrypt_secret

logger = structlog.get_logger()


async def reconcile_account(db: AsyncSession, account: Account) -> dict:
    """Compare DB baskets vs Binance positions/orders for a single account.

    Returns a summary of actions taken.
    """
    summary = {"account_id": str(account.id), "actions": []}

    try:
        api_key = decrypt_secret(account.api_key_encrypted)
        api_secret = decrypt_secret(account.api_secret_encrypted)
        client = BinanceClient(
            api_key=api_key,
            api_secret=api_secret,
            is_testnet=account.is_testnet,
        )

        # Get open positions from Binance
        positions = await client.get_position_info()
        open_symbols = set()
        for pos in positions:
            amt = float(pos.get("positionAmt", 0))
            if abs(amt) > 0:
                open_symbols.add(pos.get("symbol"))

        # Get DB baskets in OPEN/OPENING state
        result = await db.execute(
            select(Basket).where(
                Basket.account_id == account.id,
                Basket.status.in_(["OPEN", "OPENING"]),
            )
        )
        db_baskets = result.scalars().all()

        for basket in db_baskets:
            if basket.symbol not in open_symbols:
                # DB thinks there's an open basket, but Binance has no position
                # This means the position was closed (TP hit, liquidated, or manually closed)
                logger.warning(
                    "reconcile_orphan_basket",
                    basket_id=str(basket.id),
                    symbol=basket.symbol,
                    status=basket.status,
                    action="marking_closed",
                )
                basket.status = "CLOSED"
                basket.exit_reason = "reconciled_no_position"
                from datetime import datetime, timezone
                basket.closed_at = datetime.now(timezone.utc)

                # Try to recover PnL from Binance trade history
                try:
                    from app.models.order import Order
                    order_result = await db.execute(
                        select(Order).where(Order.basket_id == basket.id)
                    )
                    db_orders = order_result.scalars().all()
                    basket_order_ids = {
                        str(o.binance_order_id) for o in db_orders
                        if o.binance_order_id
                    }

                    if basket_order_ids:
                        trades = await client.get_trade_history(
                            symbol=basket.symbol, limit=100
                        )
                        matched = [
                            t for t in trades
                            if str(t.get("orderId")) in basket_order_ids
                        ]
                        if matched:
                            recovered_pnl = sum(
                                float(t.get("realizedPnl", 0)) for t in matched
                            )
                            recovered_fees = sum(
                                float(t.get("commission", 0)) for t in matched
                            )
                            basket.realized_pnl = recovered_pnl
                            basket.fees_paid = recovered_fees
                            logger.info(
                                "reconcile_pnl_recovered",
                                basket_id=str(basket.id),
                                pnl=recovered_pnl,
                                fees=recovered_fees,
                                trade_count=len(matched),
                            )

                            # Deduct fee if profitable
                            if recovered_pnl > 0:
                                from app.services.fee_service import deduct_fee
                                await deduct_fee(
                                    db, account.user_id,
                                    basket.id, recovered_pnl
                                )
                except Exception as pnl_err:
                    logger.warning(
                        "reconcile_pnl_recovery_failed",
                        basket_id=str(basket.id),
                        error=str(pnl_err),
                    )
                summary["actions"].append(f"Closed orphan basket {basket.id} ({basket.symbol})")

        # Check for orphan positions (Binance has position, DB has no basket)
        db_symbols = {b.symbol for b in db_baskets}
        orphan_positions = open_symbols - db_symbols
        for symbol in orphan_positions:
            logger.warning(
                "reconcile_orphan_position",
                account_id=str(account.id),
                symbol=symbol,
                action="flagged_for_review",
            )
            summary["actions"].append(f"Orphan position found: {symbol} (not tracked in DB)")

        await db.commit()

    except Exception as e:
        logger.error("reconcile_error", account_id=str(account.id), error=str(e))
        summary["error"] = str(e)

    return summary


async def reconcile_all_running(db: AsyncSession) -> list[dict]:
    """Run reconciliation for all RUNNING accounts."""
    result = await db.execute(
        select(Account).where(
            Account.status.in_(["RUNNING", "PAUSED"]),
            Account.deleted_at == None,
        )
    )
    accounts = result.scalars().all()

    summaries = []
    for account in accounts:
        summary = await reconcile_account(db, account)
        summaries.append(summary)

    return summaries
