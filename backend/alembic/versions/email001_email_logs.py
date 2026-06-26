"""Add email_logs table.

Revision ID: email001_email_logs
Revises: aff002_affiliate_wallet
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "email001_email_logs"
down_revision = "aff002_affiliate_wallet"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("to_email", sa.String(255), nullable=False, index=True),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"), index=True),
    )


def downgrade() -> None:
    op.drop_table("email_logs")
