"""Branded HTML email templates for Twin Grid Console."""


def _base_template(title: str, body_html: str) -> str:
    """Wrap content in branded email layout."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title></head>
<body style="margin:0;padding:0;background-color:#0B0E11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0B0E11;padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#181A20;border-radius:16px;border:1px solid #2B2F36;overflow:hidden;">
<!-- Header -->
<tr><td style="padding:32px 32px 24px;border-bottom:1px solid #2B2F36;">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td><div style="display:inline-block;width:36px;height:36px;background:linear-gradient(135deg,#F0B90B,#D4A20B);border-radius:10px;text-align:center;line-height:36px;font-size:18px;">⚡</div></td>
<td style="padding-left:12px;font-size:18px;font-weight:700;color:#EAECEF;letter-spacing:-0.3px;">TWIN GRID</td>
</tr></table>
</td></tr>
<!-- Body -->
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#EAECEF;line-height:1.3;">{title}</h1>
{body_html}
</td></tr>
<!-- Footer -->
<tr><td style="padding:24px 32px;border-top:1px solid #2B2F36;background-color:#0B0E11;">
<p style="margin:0;font-size:11px;color:#5E6673;line-height:1.5;">
This is an automated message from Twin Grid Console.<br>
Please do not reply to this email.
</p>
</td></tr>
</table>
</td></tr></table>
</body></html>"""


def _stat_row(label: str, value: str, color: str = "#EAECEF") -> str:
    return f"""<tr>
<td style="padding:8px 0;font-size:13px;color:#848E9C;">{label}</td>
<td style="padding:8px 0;font-size:13px;font-weight:600;color:{color};text-align:right;font-family:'Courier New',monospace;">{value}</td>
</tr>"""


def _button(text: str, url: str) -> str:
    return f"""<div style="text-align:center;margin:28px 0 8px;">
<a href="{url}" style="display:inline-block;padding:12px 32px;background:linear-gradient(90deg,#F0B90B,#F8D12F);color:#0B0E11;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">{text}</a>
</div>"""


def _info_box(text: str, color: str = "#F0B90B") -> str:
    return f"""<div style="margin:20px 0;padding:14px 16px;background-color:{color}08;border:1px solid {color}25;border-radius:10px;border-left:3px solid {color};">
<p style="margin:0;font-size:13px;color:#EAECEF;line-height:1.5;">{text}</p>
</div>"""


def _otp_block(otp: str) -> str:
    """Render a large, centered 6-digit OTP code."""
    digits = "".join(
        f'<td style="width:44px;height:52px;text-align:center;font-size:28px;font-weight:800;'
        f"color:#EAECEF;background-color:#0B0E11;border:2px solid #F0B90B;border-radius:10px;"
        f"font-family:'Courier New',monospace;letter-spacing:2px;\">{d}</td>"
        for d in otp
    )
    return f"""<div style="text-align:center;margin:28px 0 12px;">
<table cellpadding="0" cellspacing="6" style="margin:0 auto;"><tr>{digits}</tr></table>
</div>
<p style="margin:0;text-align:center;font-size:11px;color:#5E6673;">This code expires in 30 minutes</p>"""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. Welcome / Verify Email OTP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def welcome_email(display_name: str, otp: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Hi <strong style="color:#EAECEF;">{display_name}</strong>, welcome to Twin Grid Console! 🎉
</p>
<p style="margin:0 0 8px;font-size:14px;color:#848E9C;line-height:1.6;">
Please enter the following verification code to complete your registration:
</p>
{_otp_block(otp)}
<p style="margin:16px 0 0;font-size:12px;color:#5E6673;line-height:1.5;">
If you didn't create this account, please ignore this email.
</p>"""
    return "Verify Your Email", _base_template("Verify Your Email", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. Login Alert (New IP)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def login_alert_email(ip: str, user_agent: str, time: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
A new login was detected on your Twin Grid account:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("IP Address", ip)}
{_stat_row("Device", user_agent[:60] + "..." if len(user_agent) > 60 else user_agent)}
{_stat_row("Time", time)}
</table>
{_info_box("If this wasn't you, please change your password immediately and enable 2FA.", "#F6465D")}"""
    return "New Login Detected", _base_template("New Login Detected", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. Password Reset OTP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def password_reset_email(otp: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
We received a request to reset your password. Enter this code to proceed:
</p>
{_otp_block(otp)}
<p style="margin:16px 0 0;font-size:12px;color:#5E6673;line-height:1.5;">
If you didn't request this, please ignore this email.
</p>"""
    return "Password Reset Code", _base_template("Reset Your Password", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. Account Suspended
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def account_suspended_email(reason: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Your Twin Grid account has been <strong style="color:#F6465D;">suspended</strong>.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Reason", reason, "#F6465D")}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#848E9C;line-height:1.6;">
All active sessions have been terminated and trading has been halted. Contact support for more information.
</p>"""
    return "Account Suspended", _base_template("Account Suspended", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 5. Account Unsuspended
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def account_unsuspended_email(app_url: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Your Twin Grid account has been <strong style="color:#0ECB81;">restored</strong>.
</p>
<p style="margin:0 0 8px;font-size:14px;color:#848E9C;line-height:1.6;">
You can now log in and resume trading:
</p>
{_button("Go to Dashboard", app_url)}"""
    return "Account Restored", _base_template("Account Restored", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 6. Basket Opened
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def basket_opened_email(
    symbol: str, side: str, entry: str, margin: str, leverage: str
) -> tuple[str, str]:
    side_color = "#0ECB81" if side == "LONG" else "#F6465D"
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
A new grid basket has been opened on your account:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Symbol", symbol, "#F0B90B")}
{_stat_row("Side", side, side_color)}
{_stat_row("Entry Price", entry)}
{_stat_row("Margin", margin)}
{_stat_row("Leverage", leverage + "x")}
</table>"""
    return f"Basket Opened — {symbol} {side}", _base_template(f"New {side} Basket", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 7. Basket Closed (TP Hit)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def basket_closed_email(
    symbol: str, side: str, pnl: str, fees: str, duration: str, exit_reason: str
) -> tuple[str, str]:
    pnl_color = "#0ECB81" if not pnl.startswith("-") else "#F6465D"
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
A grid basket has been closed:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Symbol", symbol, "#F0B90B")}
{_stat_row("Side", side)}
{_stat_row("Realized PnL", pnl, pnl_color)}
{_stat_row("Fees Paid", fees)}
{_stat_row("Duration", duration)}
{_stat_row("Exit Reason", exit_reason)}
</table>"""
    return f"Basket Closed — {symbol} {pnl}", _base_template("Basket Closed", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 8. Fee Deducted
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def fee_deducted_email(
    fee_amount: str, fee_pct: str, basket_pnl: str, balance_after: str
) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
A Twin Grid fee has been deducted from your balance:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Fee Rate", fee_pct + "%")}
{_stat_row("Basket Profit", basket_pnl, "#0ECB81")}
{_stat_row("Fee Deducted", "-" + fee_amount, "#F6465D")}
{_stat_row("TG Balance", balance_after, "#F0B90B")}
</table>"""
    return f"Fee Deducted — ${fee_amount}", _base_template("Fee Deducted", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 9. Deposit Credited
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def deposit_credited_email(amount: str, balance_after: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Your Twin Grid balance has been credited:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Deposit Amount", "+" + amount, "#0ECB81")}
{_stat_row("New Balance", balance_after, "#F0B90B")}
</table>"""
    return f"Deposit Credited — ${amount}", _base_template("Deposit Credited", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 10. Low Balance Warning
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def low_balance_email(balance: str, min_required: str) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Your Twin Grid balance is running low:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Current Balance", balance, "#F6465D")}
{_stat_row("Min. Required", min_required, "#F0B90B")}
</table>
{_info_box("⚠️ New baskets will be blocked if your balance falls below the minimum. Please deposit to continue trading.", "#F0B90B")}"""
    return "Low Balance Warning", _base_template("Low Balance Warning", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 11. Position Closed Externally (Manual Close / Liquidation / ADL)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def position_closed_externally_email(
    symbol: str, side: str, exit_reason: str, pnl: str, fees: str, duration: str
) -> tuple[str, str]:
    reason_map = {
        "MANUAL_CLOSE": (
            "⚠️",
            "Closed on Binance",
            "#F0B90B",
            "This position was closed directly on the Binance platform, not by Twin Grid. "
            "All orphan orders have been automatically canceled.",
        ),
        "LIQUIDATION": (
            "🚨",
            "Liquidation",
            "#F6465D",
            "This position was liquidated by the exchange due to insufficient margin. "
            "Please review your leverage and risk settings.",
        ),
        "ADL": (
            "⚡",
            "Auto-Deleveraging",
            "#F6465D",
            "This position was closed by Binance's Auto-Deleveraging system. "
            "This occurs when the insurance fund is insufficient.",
        ),
    }
    emoji, reason_label, color, explanation = reason_map.get(
        exit_reason, ("⚠️", exit_reason, "#F0B90B", "This position was closed externally.")
    )
    pnl_color = "#0ECB81" if not pnl.startswith("-") else "#F6465D"
    side_color = "#0ECB81" if side == "LONG" else "#F6465D"
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
{emoji} A position was <strong style="color:{color};">closed externally</strong> on your account:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Symbol", symbol, "#F0B90B")}
{_stat_row("Side", side, side_color)}
{_stat_row("Exit Reason", f"{emoji} {reason_label}", color)}
{_stat_row("Realized PnL", pnl, pnl_color)}
{_stat_row("Fees Paid", fees)}
{_stat_row("Duration", duration)}
</table>
{_info_box(explanation, color)}"""
    return (
        f"{emoji} Position Closed — {symbol} ({reason_label})",
        _base_template(f"{emoji} Position Closed Externally", body),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 12. Risk Controller Stop
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def risk_stop_email(
    symbol: str, side: str, pnl: str, sos_filled: str, trigger_reason: str
) -> tuple[str, str]:
    pnl_color = "#0ECB81" if not pnl.startswith("-") else "#F6465D"
    side_color = "#0ECB81" if side == "LONG" else "#F6465D"
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
🛡️ The <strong style="color:#F0B90B;">Risk Controller</strong> has automatically closed a position to protect your account:
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Symbol", symbol, "#F0B90B")}
{_stat_row("Side", side, side_color)}
{_stat_row("SOs Filled", sos_filled)}
{_stat_row("Realized PnL", pnl, pnl_color)}
{
        _stat_row(
            "Trigger",
            trigger_reason.split(":")[0] if ":" in trigger_reason else trigger_reason,
            "#F0B90B",
        )
    }
</table>
{
        _info_box(
            "The Risk Controller closed this basket before it could reach liquidation. "
            "This is a controlled loss to preserve your capital. "
            "Review your risk settings in Account Settings if you want to adjust thresholds.",
            "#F0B90B",
        )
    }"""
    return (
        f"🛡️ Risk Stop — {symbol} {pnl}",
        _base_template("🛡️ Risk Controller Triggered", body),
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 13. Subscription Activated / Upgraded
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def subscription_activated_email(
    display_name: str,
    plan_name: str,
    amount_charged: float,
    next_billing: str,
    fee_pct: float,
    max_accounts: str,
    app_url: str,
) -> tuple[str, str]:
    plan_color = (
        "#F0B90B"
        if plan_name.lower() == "pro"
        else "#A855F7"
        if plan_name.lower() == "elite"
        else "#848E9C"
    )
    badge = f'<span style="display:inline-block;padding:2px 10px;background:{plan_color}20;border:1px solid {plan_color}40;border-radius:20px;color:{plan_color};font-size:11px;font-weight:700;">{plan_name.upper()}</span>'
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Hi <strong style="color:#EAECEF;">{display_name}</strong>,<br>
Your Twin Grid subscription has been activated! {badge}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Plan", plan_name, plan_color)}
{_stat_row("Amount Charged", f"${amount_charged:.2f} USDT", "#F6465D")}
{_stat_row("Profit Share", f"{fee_pct}%", "#EAECEF")}
{_stat_row("Binance Accounts", max_accounts)}
{_stat_row("Next Billing", next_billing, "#F0B90B")}
</table>
{_info_box("💡 Billing is deducted from your TwinGrid Wallet balance each month. Keep your wallet topped up to maintain uninterrupted access.", "#0ECB81")}
{_button("Go to Dashboard", app_url)}"""
    return f"✅ {plan_name} Subscription Activated", _base_template(
        f"Welcome to {plan_name}!", body
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 14. Subscription Renewed
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def subscription_renewed_email(
    display_name: str,
    plan_name: str,
    amount_charged: float,
    next_billing: str,
    balance_after: float,
    app_url: str,
) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Hi <strong style="color:#EAECEF;">{display_name}</strong>,<br>
Your <strong style="color:#F0B90B;">{plan_name}</strong> subscription has been renewed successfully.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Plan", plan_name, "#F0B90B")}
{_stat_row("Amount Charged", f"${amount_charged:.2f} USDT", "#F6465D")}
{_stat_row("Wallet Balance", f"${balance_after:.2f} USDT", "#EAECEF")}
{_stat_row("Next Renewal", next_billing, "#F0B90B")}
</table>
{_button("View Billing History", f"{app_url}/dashboard/subscription")}"""
    return f"🔄 {plan_name} Subscription Renewed", _base_template("Subscription Renewed", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 15. Payment Failed — Grace Period Started
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def subscription_payment_failed_email(
    display_name: str,
    plan_name: str,
    amount_due: float,
    current_balance: float,
    grace_period_end: str,
    app_url: str,
) -> tuple[str, str]:
    shortfall = max(0, amount_due - current_balance)
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Hi <strong style="color:#EAECEF;">{display_name}</strong>,<br>
We were unable to renew your <strong style="color:#F0B90B;">{plan_name}</strong> subscription due to insufficient wallet balance.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Amount Due", f"${amount_due:.2f} USDT", "#F0B90B")}
{_stat_row("Current Balance", f"${current_balance:.2f} USDT", "#F6465D")}
{_stat_row("Shortfall", f"${shortfall:.2f} USDT", "#F6465D")}
{_stat_row("Grace Period Ends", grace_period_end, "#F0B90B")}
</table>
{_info_box(f"⚠️ You have a 3-day grace period. Please deposit at least ${shortfall:.2f} USDT to your TwinGrid Wallet before {grace_period_end} to keep your {plan_name} plan. After this date, your account will be downgraded to the Free tier.", "#F0B90B")}
{_button("Top Up Wallet Now", f"{app_url}/dashboard/wallet")}"""
    return f"⚠️ Payment Failed — {plan_name} Subscription", _base_template("Payment Failed", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 16. Downgraded to Free
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def subscription_downgraded_email(
    display_name: str,
    old_plan_name: str,
    reason: str,
    app_url: str,
) -> tuple[str, str]:
    reason_labels = {
        "payment_failed_after_grace": "Your 3-day grace period expired without a successful payment.",
        "cancelled_by_user": "You cancelled your subscription at the end of the billing period.",
        "admin_override": "Your plan was changed by an administrator.",
    }
    reason_text = reason_labels.get(reason, "Your subscription was ended.")
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Hi <strong style="color:#EAECEF;">{display_name}</strong>,<br>
Your <strong style="color:#F0B90B;">{old_plan_name}</strong> subscription has ended and your account has been moved to the <strong style="color:#848E9C;">Free</strong> plan.
</p>
{_info_box(f"Reason: {reason_text}", "#F6465D")}
<p style="margin:16px 0;font-size:13px;color:#848E9C;line-height:1.6;">
On the Free plan, you can connect 1 Binance account with a 25% profit share. Backtest Engine and AI Strategy Builder access has been suspended.
</p>
{_button("Reactivate Subscription", f"{app_url}/dashboard/subscription")}"""
    return "📉 Downgraded to Free Plan", _base_template("Plan Downgraded", body)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 17. Subscription Cancelled (confirmation)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def subscription_cancelled_email(
    display_name: str,
    plan_name: str,
    access_until: str,
    app_url: str,
) -> tuple[str, str]:
    body = f"""
<p style="margin:0 0 16px;font-size:14px;color:#848E9C;line-height:1.6;">
Hi <strong style="color:#EAECEF;">{display_name}</strong>,<br>
Your <strong style="color:#F0B90B;">{plan_name}</strong> subscription has been cancelled as requested.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background-color:#0B0E11;border-radius:10px;padding:16px;border:1px solid #2B2F36;">
{_stat_row("Plan", plan_name, "#F0B90B")}
{_stat_row("Access Until", access_until, "#0ECB81")}
{_stat_row("After That", "Free Plan", "#848E9C")}
</table>
{_info_box("You will retain full access to all your current plan features until the period ends. No further charges will be made.", "#848E9C")}
{_button("Reactivate Anytime", f"{app_url}/dashboard/subscription")}"""
    return f"Subscription Cancelled — {plan_name}", _base_template("Subscription Cancelled", body)
