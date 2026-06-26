"""Add Telegram notification columns to users table.

Revision ID: tg001
Revises: sub001
Create Date: 2026-05-19
"""
from alembic import op
import json
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "tg001"
down_revision = "sub001_subscription_system"
branch_labels = None
depends_on = None

DEFAULT_TG_PREFS = {
    "basket_opened": True,
    "basket_closed": True,
    "safety_order": True,
    "risk_stop": True,
    "external_close": True,
    "fee_deducted": False,
    "deposit_credited": True,
    "low_balance": True,
}


def upgrade() -> None:
    op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    op.add_column("users", sa.Column("telegram_username", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("telegram_connected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("telegram_link_token", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("telegram_link_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("telegram_notifications", JSONB, server_default=sa.text(f"'{json.dumps(DEFAULT_TG_PREFS)}'::jsonb"), nullable=True),
    )
    op.create_unique_constraint("uq_users_telegram_chat_id", "users", ["telegram_chat_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_telegram_chat_id", "users", type_="unique")
    op.drop_column("users", "telegram_notifications")
    op.drop_column("users", "telegram_link_expires_at")
    op.drop_column("users", "telegram_link_token")
    op.drop_column("users", "telegram_connected_at")
    op.drop_column("users", "telegram_username")
    op.drop_column("users", "telegram_chat_id")
