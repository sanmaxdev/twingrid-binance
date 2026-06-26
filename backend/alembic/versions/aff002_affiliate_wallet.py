"""Add affiliate wallet — withdrawals table + balance column.

Revision ID: aff002_affiliate_wallet
Revises: aff001_affiliate_system
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'aff002_affiliate_wallet'
down_revision = 'aff001_affiliate_system'
branch_labels = None
depends_on = None


def upgrade():
    # Affiliate withdrawals table
    op.create_table(
        'affiliate_withdrawals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('amount', sa.Numeric(24, 8), nullable=False),
        sa.Column('method', sa.String(20), nullable=False),
        sa.Column('wallet_address', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='PENDING'),
        sa.Column('tx_hash', sa.String(255), nullable=True),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reject_reason', sa.Text, nullable=True),
        sa.Column('admin_note', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Separate affiliate balance column
    op.add_column('users', sa.Column('affiliate_balance', sa.Numeric(24, 8), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('users', 'affiliate_balance')
    op.drop_table('affiliate_withdrawals')
