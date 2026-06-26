"""Add backtest_history table.

Revision ID: bt001_backtest_history
Revises: email001_email_logs
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "bt001_backtest_history"
down_revision = "email001_email_logs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backtest_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("symbol", sa.String(20), nullable=False, index=True),
        sa.Column("period_days", sa.Integer(), nullable=False),
        sa.Column("initial_capital", sa.Float(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("total_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("winning_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("losing_trades", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("win_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_pnl", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_pnl_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_drawdown_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("sharpe_ratio", sa.Float(), nullable=False, server_default="0"),
        sa.Column("profit_factor", sa.Float(), nullable=False, server_default="0"),
        sa.Column("final_capital", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_fees_paid", sa.Float(), nullable=False, server_default="0"),
        sa.Column("liquidated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("trend_filter_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("trend_blocked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("full_result", postgresql.JSONB(), nullable=False),
        sa.Column("label", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"), index=True),
    )


def downgrade() -> None:
    op.drop_table("backtest_history")
