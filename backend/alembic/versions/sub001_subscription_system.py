"""Add subscription system tables.

Revision ID: sub001_subscription_system
Revises: md001_market_data_cache
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "sub001_subscription_system"
down_revision = "md001_market_data_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── subscription_plans (admin-configurable) ─────────────────────────────
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.String(20), primary_key=True),  # 'free', 'pro', 'elite'
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("price_usd", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("max_accounts", sa.Integer(), nullable=True),  # NULL = unlimited
        sa.Column("default_fee_pct", sa.Numeric(8, 4), nullable=False, server_default="25"),
        sa.Column("daily_backtest_limit", sa.Integer(), nullable=True),  # NULL = no access
        sa.Column("max_backtest_days", sa.Integer(), nullable=True),  # max range in days
        sa.Column("ai_builder_access", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )

    # Seed default plans
    op.execute("""
        INSERT INTO subscription_plans (id, name, price_usd, max_accounts, default_fee_pct, daily_backtest_limit, max_backtest_days, ai_builder_access, sort_order, description) VALUES
        ('free',  'Free',  0,  1, 25, NULL,  NULL, false, 0, 'Get started with one account and basic trading features.'),
        ('pro',   'Pro',  10,  5, 20,    5,   180, false, 1, 'Scale up with 5 accounts, lower fees, and the Backtest Engine.'),
        ('elite', 'Elite', 20, NULL, 15,  20,   180, true,  2, 'Unlimited accounts, lowest fees, AI Strategy Builder access.')
    """)

    # ── user_subscriptions ──────────────────────────────────────────────────
    op.create_table(
        "user_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, unique=True, index=True),
        sa.Column("plan_id", sa.String(20), sa.ForeignKey("subscription_plans.id"), nullable=False, server_default="free"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        # status: active, grace_period, cancelled, expired
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now() + interval '30 days'")),
        sa.Column("grace_period_end", sa.DateTime(timezone=True), nullable=True),  # 3 days after period_end on failed renewal
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── subscription_invoices ────────────────────────────────────────────────
    op.create_table(
        "subscription_invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("user_subscriptions.id"), nullable=False),
        sa.Column("plan_id", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(24, 8), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),  # paid, failed, refunded
        sa.Column("billing_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("billing_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fee_transaction_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fee_transactions.id"), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── user_backtest_usage (daily quota tracking) ───────────────────────────
    op.create_table(
        "user_backtest_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "date", name="uq_user_backtest_date"),
    )


def downgrade() -> None:
    op.drop_table("user_backtest_usage")
    op.drop_table("subscription_invoices")
    op.drop_table("user_subscriptions")
    op.drop_table("subscription_plans")
