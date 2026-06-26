#!/usr/bin/env python3
# Backfill fees and funding for historical baskets
import asyncio
import sys
sys.path.insert(0, '/app')

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.core.config import settings
from app.models.basket import Basket
from app.models.order import Order
from app.models.account import Account
from app.services.binance_client import BinanceClient
from app.core.security import decrypt_secret

# Create a standalone engine with just 1 connection
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_size=1,
    max_overflow=0,
    pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def backfill():
    async with SessionLocal() as session:
        result = await session.execute(
            select(Basket).where(
                Basket.status == 'CLOSED',
            ).order_by(Basket.closed_at.desc())
        )
        baskets = result.scalars().all()
        print(f'Found {len(baskets)} closed baskets to check')

        # Cache clients by account_id
        clients = {}
        updated = 0

        for basket in baskets:
            fees_val = float(basket.fees_paid or 0)
            funding_val = float(basket.funding_paid or 0)

            # Skip if both are already populated
            if fees_val != 0 and funding_val != 0:
                print(f'  SKIP {str(basket.id)[:8]}: fees=${fees_val:.4f}, funding=${funding_val:.4f}')
                continue

            # Get client for this account
            if basket.account_id not in clients:
                acct_result = await session.execute(
                    select(Account).where(Account.id == basket.account_id)
                )
                account = acct_result.scalars().first()
                if not account:
                    print(f'  ERROR: Account {basket.account_id} not found')
                    continue
                try:
                    api_key = decrypt_secret(account.api_key_encrypted)
                    api_secret = decrypt_secret(account.api_secret_encrypted)
                    clients[basket.account_id] = BinanceClient(
                        api_key, api_secret, is_testnet=account.is_testnet
                    )
                except Exception as e:
                    print(f'  ERROR decrypting creds for account {basket.account_id}: {e}')
                    continue

            client = clients[basket.account_id]
            symbol = basket.symbol

            # Get all orders for this basket
            orders_result = await session.execute(
                select(Order).where(Order.basket_id == basket.id)
            )
            all_orders = orders_result.scalars().all()
            basket_order_ids = {
                str(o.binance_order_id) for o in all_orders if o.binance_order_id
            }

            needs_update = False

            # 1. Backfill trading fees from Binance userTrades
            if fees_val == 0 and basket_order_ids:
                try:
                    trades = await client.get_trade_history(symbol, limit=100)
                    matched = [
                        t for t in trades
                        if str(t.get('orderId', '')) in basket_order_ids
                    ]
                    if matched:
                        real_fees = sum(float(t.get('commission', 0)) for t in matched)
                        basket.fees_paid = real_fees
                        needs_update = True
                        # Also update individual order commissions
                        for order in all_orders:
                            if float(order.commission or 0) == 0:
                                order_trades = [
                                    t for t in matched
                                    if str(t.get('orderId')) == str(order.binance_order_id)
                                ]
                                if order_trades:
                                    order.commission = sum(
                                        float(t.get('commission', 0)) for t in order_trades
                                    )
                        print(f'  FEES {str(basket.id)[:8]}: ${real_fees:.6f} ({len(matched)} trades)')
                    else:
                        # Estimate: 0.04% taker fee on notional
                        if basket.avg_entry and basket.qty:
                            notional = float(basket.avg_entry) * float(basket.qty)
                            est_fee = notional * 0.0004 * 2  # entry + exit
                            basket.fees_paid = est_fee
                            needs_update = True
                            print(f'  FEES {str(basket.id)[:8]}: ~${est_fee:.6f} (estimated)')
                        else:
                            print(f'  FEES {str(basket.id)[:8]}: no trades found')
                except Exception as e:
                    print(f'  FEES ERROR {str(basket.id)[:8]}: {e}')

            # 2. Backfill funding fees from Binance income history
            if funding_val == 0 and basket.opened_at:
                try:
                    start_ms = int(basket.opened_at.timestamp() * 1000)
                    from datetime import datetime, timezone
                    closed_at = basket.closed_at or datetime.now(timezone.utc)
                    end_ms = int(closed_at.timestamp() * 1000)

                    funding_records = await client.get_income_history(
                        income_type='FUNDING_FEE',
                        symbol=symbol,
                        start_time=start_ms,
                        end_time=end_ms,
                    )
                    if funding_records:
                        total_funding = sum(float(r.get('income', 0)) for r in funding_records)
                        basket.funding_paid = total_funding
                        needs_update = True
                        print(f'  FUND {str(basket.id)[:8]}: ${total_funding:.6f} ({len(funding_records)} records)')
                    else:
                        basket.funding_paid = 0
                        print(f'  FUND {str(basket.id)[:8]}: $0.0000 (no records)')
                except Exception as e:
                    print(f'  FUND ERROR {str(basket.id)[:8]}: {e}')

            if needs_update:
                updated += 1

            await asyncio.sleep(0.3)  # Rate limit

        await session.commit()
        print(f'\nDone! Updated {updated} baskets.')

    await engine.dispose()


asyncio.run(backfill())
