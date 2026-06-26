"""enterprise blueprint models

Revision ID: bb1234567890
Revises: ff772f117355
Create Date: 2026-04-26 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'bb1234567890'
down_revision = 'ff772f117355'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create equity_snapshots table using raw SQL with IF NOT EXISTS
    op.execute("""
        CREATE TABLE IF NOT EXISTS equity_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            wallet_balance NUMERIC(18,8) NOT NULL DEFAULT 0,
            total_equity NUMERIC(18,8) NOT NULL DEFAULT 0,
            unrealized_pnl NUMERIC(18,8) NOT NULL DEFAULT 0,
            margin_used NUMERIC(18,8) NOT NULL DEFAULT 0,
            recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_equity_snapshots_account_recorded
        ON equity_snapshots (account_id, recorded_at)
    """)

    # Create events table
    op.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            type VARCHAR(100) NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
            title VARCHAR(255) NOT NULL,
            message TEXT,
            user_id UUID,
            account_id UUID,
            basket_id UUID,
            payload JSONB,
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_events_severity ON events (severity)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_events_occurred_at ON events (occurred_at)")

    # Add missing columns to users table (safe with DO block)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN suspended_reason VARCHAR(500);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(45);
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD COLUMN force_password_reset BOOLEAN NOT NULL DEFAULT false;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)

    # Add impersonating column to audit_log
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE audit_log ADD COLUMN impersonating BOOLEAN NOT NULL DEFAULT false;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS events")
    op.execute("DROP TABLE IF EXISTS equity_snapshots")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users DROP COLUMN IF EXISTS suspended_at;
            ALTER TABLE users DROP COLUMN IF EXISTS suspended_reason;
            ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
            ALTER TABLE users DROP COLUMN IF EXISTS last_login_ip;
            ALTER TABLE users DROP COLUMN IF EXISTS force_password_reset;
            ALTER TABLE audit_log DROP COLUMN IF EXISTS impersonating;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$
    """)
