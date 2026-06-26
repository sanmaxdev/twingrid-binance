"""Add market_data_cache table.

Revision ID: md001_market_data_cache
Revises: bt001_backtest_history
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "md001_market_data_cache"
down_revision = "bt001_backtest_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "market_data_cache",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("data_type", sa.String(20), nullable=False),
        sa.Column("interval", sa.String(10), nullable=False),
        sa.Column("year_month", sa.String(7), nullable=False),
        sa.Column("date_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("date_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("candle_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Unique constraint: one chunk per symbol+type+interval+month
    op.create_index(
        "uq_market_data_chunk",
        "market_data_cache",
        ["symbol", "data_type", "interval", "year_month"],
        unique=True,
    )

    # Fast lookup index
    op.create_index(
        "ix_market_data_lookup",
        "market_data_cache",
        ["symbol", "data_type", "interval"],
    )


def downgrade() -> None:
    op.drop_index("ix_market_data_lookup", table_name="market_data_cache")
    op.drop_index("uq_market_data_chunk", table_name="market_data_cache")
    op.drop_table("market_data_cache")
