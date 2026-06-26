"""Notification service — Telegram + email alerts for critical events per §18."""

import httpx
import structlog

from app.core.config import settings
from app.core.email import send_email
from app.core.email_templates import (
    account_suspended_email,
    account_unsuspended_email,
    basket_closed_email,
    basket_opened_email,
    deposit_credited_email,
    fee_deducted_email,
    login_alert_email,
    low_balance_email,
    position_closed_externally_email,
    risk_stop_email,
    subscription_activated_email,
    subscription_cancelled_email,
    subscription_downgraded_email,
    subscription_payment_failed_email,
    subscription_renewed_email,
)

logger = structlog.get_logger()

# In-memory cache of disabled email events (refreshed on toggle change)
_disabled_events: set[str] = set()


def update_disabled_events(events: dict[str, bool]):
    """Called by admin endpoint to update cache."""
    _disabled_events.clear()
    for event, enabled in events.items():
        if not enabled:
            _disabled_events.add(event)


def is_event_enabled(event_name: str) -> bool:
    """Check if an email event is enabled (default: True)."""
    return event_name not in _disabled_events


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TELEGRAM RICH MESSAGE TEMPLATES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


def _tg_basket_opened(
    account_name: str, symbol: str, side: str, entry: str, margin: str, leverage: str
) -> str:
    side_emoji = "🔼" if side.upper() == "LONG" else "🔽"
    return (
        f"🟢 <b>BASKET OPENED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 <b>{account_name}</b>\n\n"
        f"│ Symbol     <b>{symbol.replace('USDT', '/USDT')}</b>\n"
        f"│ Side         {side_emoji} <b>{side.upper()}</b>\n"
        f"│ Entry        <code>{entry}</code>\n"
        f"│ Margin      <code>{margin}</code>\n"
        f"│ Leverage   <b>{leverage}x</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_basket_closed(
    account_name: str, symbol: str, side: str, pnl: str, fees: str, duration: str, exit_reason: str
) -> str:
    pnl_float = float(pnl.replace("$", "").replace("+", "").replace(",", ""))
    pnl_emoji = "✅" if pnl_float >= 0 else "🔴"
    reason_map = {
        "TP_FILLED": "✅ Take Profit",
        "MAX_AGE": "⏰ Max Age",
        "AGE_LIMIT": "⏰ Age Limit",
        "RISK_STOP": "🛡️ Risk Stop",
        "MANUAL": "👤 Manual Close",
        "MANUAL_CLOSE": "👤 Manual Close",
        "LIQUIDATION": "💥 Liquidation",
        "ADL": "⚡ ADL",
        "EMERGENCY": "🚨 Emergency",
    }
    reason_display = reason_map.get(exit_reason, exit_reason)
    return (
        f"{pnl_emoji} <b>BASKET CLOSED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 <b>{account_name}</b>\n\n"
        f"│ Symbol       <b>{symbol.replace('USDT', '/USDT')}</b>\n"
        f"│ Side           {'🔼' if side.upper() == 'LONG' else '🔽'} {side.upper()}\n"
        f"│ PnL            <b>{pnl}</b>\n"
        f"│ Fees           <code>{fees}</code>\n"
        f"│ Duration    <code>{duration}</code>\n"
        f"│ Reason       {reason_display}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_safety_order(
    account_name: str,
    symbol: str,
    side: str,
    so_number: str,
    fill_price: str,
    new_avg: str,
    total_qty: str,
) -> str:
    return (
        f"🔵 <b>SAFETY ORDER FILLED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 <b>{account_name}</b>\n\n"
        f"│ Symbol       <b>{symbol.replace('USDT', '/USDT')}</b>\n"
        f"│ Side           {'🔼' if side.upper() == 'LONG' else '🔽'} {side.upper()}\n"
        f"│ SO #            <b>{so_number}</b>\n"
        f"│ Fill Price    <code>{fill_price}</code>\n"
        f"│ New Avg     <code>{new_avg}</code>\n"
        f"│ Total Qty    <code>{total_qty}</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_risk_stop(
    account_name: str, symbol: str, side: str, pnl: str, sos_filled: str, reason: str
) -> str:
    return (
        f"🛡️ <b>RISK STOP TRIGGERED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 <b>{account_name}</b>\n\n"
        f"│ Symbol       <b>{symbol.replace('USDT', '/USDT')}</b>\n"
        f"│ Side           {'🔼' if side.upper() == 'LONG' else '🔽'} {side.upper()}\n"
        f"│ PnL            <b>{pnl}</b>\n"
        f"│ SOs Filled  <code>{sos_filled}</code>\n"
        f"│ Reason       {reason}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_external_close(
    account_name: str, symbol: str, side: str, exit_reason: str, pnl: str, fees: str, duration: str
) -> str:
    reason_map = {
        "TP_FILLED": "✅ Take Profit",
        "MANUAL_CLOSE": "👤 Manual Close",
        "MANUAL": "👤 Manual Close",
        "LIQUIDATION": "💥 Liquidation",
        "ADL": "⚡ ADL",
        "RISK_STOP": "🛡️ Risk Stop",
        "AGE_LIMIT": "⏰ Age Limit",
        "EMERGENCY": "🚨 Emergency",
    }
    reason_display = reason_map.get(exit_reason, exit_reason)
    return (
        f"🔴 <b>EXTERNAL CLOSE</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 <b>{account_name}</b>\n\n"
        f"│ Symbol       <b>{symbol.replace('USDT', '/USDT')}</b>\n"
        f"│ Side           {'🔼' if side.upper() == 'LONG' else '🔽'} {side.upper()}\n"
        f"│ Reason       {reason_display}\n"
        f"│ PnL            <b>{pnl}</b>\n"
        f"│ Fees           <code>{fees}</code>\n"
        f"│ Duration    <code>{duration}</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_fee_deducted(
    account_name: str, fee_amount: str, fee_pct: str, basket_pnl: str, balance_after: str
) -> str:
    return (
        f"💰 <b>FEE DEDUCTED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 <b>{account_name}</b>\n\n"
        f"│ Fee             <code>{fee_amount}</code> ({fee_pct})\n"
        f"│ Basket PnL  <b>{basket_pnl}</b>\n"
        f"│ Balance       <code>{balance_after}</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_deposit_credited(amount: str, balance_after: str) -> str:
    return (
        f"💳 <b>DEPOSIT CREDITED</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"│ Amount     <code>{amount}</code>\n"
        f"│ Balance     <code>{balance_after}</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


def _tg_low_balance(balance: str, min_required: str) -> str:
    return (
        f"⚠️ <b>LOW BALANCE WARNING</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"│ Balance       <code>{balance}</code>\n"
        f"│ Minimum     <code>{min_required}</code>\n\n"
        f"⚡ <i>Deposit funds to keep trading active.</i>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━"
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NOTIFICATION SERVICE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class NotificationService:
    """Sends alerts via Telegram and/or email for critical system events."""

    def __init__(self):
        self.telegram_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        self.telegram_chat_id = getattr(settings, "TELEGRAM_CHAT_ID", None)

    async def send_telegram(self, message: str):
        """Send a Telegram message to ADMIN chat if configured."""
        if not self.telegram_token or not self.telegram_chat_id:
            return

        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    url,
                    json={
                        "chat_id": self.telegram_chat_id,
                        "text": message,
                        "parse_mode": "HTML",
                    },
                )
                if resp.status_code != 200:
                    logger.error("telegram_send_failed", status=resp.status_code, body=resp.text)
        except Exception as e:
            logger.error("telegram_error", error=str(e))

    async def send_user_telegram(self, user_id, event_key: str, message: str):
        """Send a Telegram message to a specific USER if they have Telegram connected + event enabled."""
        if not self.telegram_token:
            return

        try:
            from sqlalchemy import select

            from app.core.database import AsyncSessionLocal
            from app.models.user import User

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(User.telegram_chat_id, User.telegram_notifications).where(
                        User.id == user_id
                    )
                )
                row = result.first()
                if not row or not row.telegram_chat_id:
                    return

                # Check per-user preference for this event
                prefs = row.telegram_notifications or {}
                if not prefs.get(event_key, True):
                    return

                from app.core.telegram_bot import send_message

                await send_message(row.telegram_chat_id, message)

        except Exception as e:
            logger.warning(
                "user_telegram_failed", user_id=str(user_id), event=event_key, error=str(e)
            )

    async def send_alert(
        self,
        title: str,
        message: str,
        severity: str = "INFO",
        email_to: str | None = None,
    ):
        """Send a multi-channel alert (admin only)."""
        emoji_map = {
            "DEBUG": "🔍",
            "INFO": "ℹ️",
            "WARN": "⚠️",
            "ERROR": "❌",
            "CRITICAL": "🚨",
        }
        emoji = emoji_map.get(severity, "📢")

        # Telegram (admin channel)
        telegram_msg = f"{emoji} <b>[{severity}] {title}</b>\n\n{message}"
        await self.send_telegram(telegram_msg)

        # Email (only for ERROR and CRITICAL)
        if severity in ("ERROR", "CRITICAL") and email_to:
            html = f"""
            <h2>{emoji} [{severity}] {title}</h2>
            <p>{message}</p>
            <p style="color: gray; font-size: 12px;">
                TWIN GRID Console — Automated Alert
            </p>
            """
            try:
                await send_email(email_to, f"[{severity}] {title}", html)
            except Exception as e:
                logger.error("alert_email_failed", error=str(e))

        logger.info("alert_sent", title=title, severity=severity)

    # ── Convenience methods ──

    async def alert_liquidation(self, account_name: str, symbol: str, side: str, pnl: float):
        await self.send_alert(
            title="Liquidation Detected",
            message=f"Account: {account_name}\nSymbol: {symbol}\nSide: {side}\nPnL: ${pnl:.2f}",
            severity="CRITICAL",
        )

    async def alert_platform_halt(self, triggered_by: str):
        await self.send_alert(
            title="Emergency Platform Halt",
            message=f"All trading halted by: {triggered_by}",
            severity="CRITICAL",
        )

    async def alert_daily_loss_limit(self, account_name: str, loss: float, limit: float):
        await self.send_alert(
            title="Daily Loss Limit Reached",
            message=f"Account: {account_name}\nLoss: ${loss:.2f} / ${limit:.2f}",
            severity="WARN",
        )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # USER-FACING EMAIL + TELEGRAM EVENTS
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def notify_login(self, email: str, ip: str, user_agent: str, time_str: str):
        """Event 2: Login alert for new IP."""
        if not is_event_enabled("login_alert"):
            return
        try:
            subject, html = login_alert_email(ip, user_agent or "Unknown", time_str)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_login_failed", error=str(e))

    async def notify_suspended(self, email: str, reason: str):
        """Event 4: Account suspended."""
        if not is_event_enabled("account_suspended"):
            return
        try:
            subject, html = account_suspended_email(reason)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_suspended_failed", error=str(e))

    async def notify_unsuspended(self, email: str):
        """Event 5: Account unsuspended."""
        if not is_event_enabled("account_unsuspended"):
            return
        try:
            subject, html = account_unsuspended_email(settings.APP_PUBLIC_URL)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_unsuspended_failed", error=str(e))

    async def notify_basket_opened(
        self,
        email: str,
        symbol: str,
        side: str,
        entry: str,
        margin: str,
        leverage: str,
        user_id=None,
        account_name: str = "Account",
    ):
        """Event 6: Basket opened — email + per-user Telegram."""
        if not is_event_enabled("basket_opened"):
            return
        try:
            subject, html = basket_opened_email(symbol, side, entry, margin, leverage)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_basket_opened_failed", error=str(e))

        # Per-user Telegram
        if user_id:
            tg_msg = _tg_basket_opened(account_name, symbol, side, entry, margin, leverage)
            await self.send_user_telegram(user_id, "basket_opened", tg_msg)

    async def notify_basket_closed(
        self,
        email: str,
        symbol: str,
        side: str,
        pnl: str,
        fees: str,
        duration: str,
        exit_reason: str,
        user_id=None,
        account_name: str = "Account",
    ):
        """Event 7: Basket closed — email + per-user Telegram."""
        if not is_event_enabled("basket_closed"):
            return
        try:
            subject, html = basket_closed_email(symbol, side, pnl, fees, duration, exit_reason)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_basket_closed_failed", error=str(e))

        # Per-user Telegram
        if user_id:
            tg_msg = _tg_basket_closed(account_name, symbol, side, pnl, fees, duration, exit_reason)
            await self.send_user_telegram(user_id, "basket_closed", tg_msg)

    async def notify_safety_order_filled(
        self,
        user_id,
        account_name: str,
        symbol: str,
        side: str,
        so_number: str,
        fill_price: str,
        new_avg: str,
        total_qty: str,
    ):
        """Event: Safety order filled — Telegram only (no email)."""
        if user_id:
            tg_msg = _tg_safety_order(
                account_name, symbol, side, so_number, fill_price, new_avg, total_qty
            )
            await self.send_user_telegram(user_id, "safety_order", tg_msg)

    async def notify_fee_deducted(
        self,
        email: str,
        fee_amount: str,
        fee_pct: str,
        basket_pnl: str,
        balance_after: str,
        user_id=None,
        account_name: str = "Account",
    ):
        """Event 8: Fee deducted."""
        if not is_event_enabled("fee_deducted"):
            return
        try:
            subject, html = fee_deducted_email(fee_amount, fee_pct, basket_pnl, balance_after)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_fee_deducted_failed", error=str(e))

        if user_id:
            tg_msg = _tg_fee_deducted(account_name, fee_amount, fee_pct, basket_pnl, balance_after)
            await self.send_user_telegram(user_id, "fee_deducted", tg_msg)

    async def notify_deposit_credited(
        self, email: str, amount: str, balance_after: str, user_id=None
    ):
        """Event 9: Deposit credited."""
        if not is_event_enabled("deposit_credited"):
            return
        try:
            subject, html = deposit_credited_email(amount, balance_after)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_deposit_credited_failed", error=str(e))

        if user_id:
            tg_msg = _tg_deposit_credited(amount, balance_after)
            await self.send_user_telegram(user_id, "deposit_credited", tg_msg)

    async def notify_low_balance(self, email: str, balance: str, min_required: str, user_id=None):
        """Event 10: Low balance warning."""
        if not is_event_enabled("low_balance"):
            return
        try:
            subject, html = low_balance_email(balance, min_required)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_low_balance_failed", error=str(e))

        if user_id:
            tg_msg = _tg_low_balance(balance, min_required)
            await self.send_user_telegram(user_id, "low_balance", tg_msg)

    async def notify_position_closed_externally(
        self,
        email: str,
        symbol: str,
        side: str,
        exit_reason: str,
        pnl: str,
        fees: str,
        duration: str,
        user_id=None,
        account_name: str = "Account",
    ):
        """Event 11: Position closed externally (manual close / liquidation / ADL)."""
        if not is_event_enabled("position_closed_externally"):
            return
        try:
            subject, html = position_closed_externally_email(
                symbol, side, exit_reason, pnl, fees, duration
            )
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_position_closed_externally_failed", error=str(e))

        if user_id:
            tg_msg = _tg_external_close(
                account_name, symbol, side, exit_reason, pnl, fees, duration
            )
            await self.send_user_telegram(user_id, "external_close", tg_msg)

    async def notify_risk_stop(
        self,
        email: str,
        symbol: str,
        side: str,
        pnl: str,
        sos_filled: str,
        trigger_reason: str,
        user_id=None,
        account_name: str = "Account",
    ):
        """Event 12: Risk controller force-closed a basket."""
        if not is_event_enabled("risk_stop"):
            return
        try:
            subject, html = risk_stop_email(symbol, side, pnl, sos_filled, trigger_reason)
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_risk_stop_failed", error=str(e))

        if user_id:
            tg_msg = _tg_risk_stop(account_name, symbol, side, pnl, sos_filled, trigger_reason)
            await self.send_user_telegram(user_id, "risk_stop", tg_msg)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # SUBSCRIPTION EMAIL EVENTS
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async def notify_subscription_activated(
        self,
        email: str,
        display_name: str,
        plan_name: str,
        amount_charged: float,
        next_billing: str,
        fee_pct: float,
        max_accounts: str,
    ):
        """Event 13: Subscription activated / upgraded."""
        if not is_event_enabled("subscription_activated"):
            return
        try:
            subject, html = subscription_activated_email(
                display_name,
                plan_name,
                amount_charged,
                next_billing,
                fee_pct,
                max_accounts,
                settings.APP_PUBLIC_URL,
            )
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_subscription_activated_failed", error=str(e))

    async def notify_subscription_renewed(
        self,
        email: str,
        display_name: str,
        plan_name: str,
        amount_charged: float,
        next_billing: str,
        balance_after: float,
    ):
        """Event 14: Subscription renewed successfully."""
        if not is_event_enabled("subscription_renewed"):
            return
        try:
            subject, html = subscription_renewed_email(
                display_name,
                plan_name,
                amount_charged,
                next_billing,
                balance_after,
                settings.APP_PUBLIC_URL,
            )
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_subscription_renewed_failed", error=str(e))

    async def notify_subscription_payment_failed(
        self,
        email: str,
        display_name: str,
        plan_name: str,
        amount_due: float,
        current_balance: float,
        grace_period_end: str,
    ):
        """Event 15: Payment failed — grace period started."""
        if not is_event_enabled("subscription_payment_failed"):
            return
        try:
            subject, html = subscription_payment_failed_email(
                display_name,
                plan_name,
                amount_due,
                current_balance,
                grace_period_end,
                settings.APP_PUBLIC_URL,
            )
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_subscription_payment_failed_failed", error=str(e))

    async def notify_subscription_downgraded(
        self,
        email: str,
        display_name: str,
        old_plan_name: str,
        reason: str,
    ):
        """Event 16: Downgraded to Free plan."""
        if not is_event_enabled("subscription_downgraded"):
            return
        try:
            subject, html = subscription_downgraded_email(
                display_name,
                old_plan_name,
                reason,
                settings.APP_PUBLIC_URL,
            )
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_subscription_downgraded_failed", error=str(e))

    async def notify_subscription_cancelled(
        self,
        email: str,
        display_name: str,
        plan_name: str,
        access_until: str,
    ):
        """Event 17: Subscription cancellation confirmed."""
        if not is_event_enabled("subscription_cancelled"):
            return
        try:
            subject, html = subscription_cancelled_email(
                display_name,
                plan_name,
                access_until,
                settings.APP_PUBLIC_URL,
            )
            await send_email(email, subject, html)
        except Exception as e:
            logger.error("notify_subscription_cancelled_failed", error=str(e))


# Singleton
notification_service = NotificationService()
