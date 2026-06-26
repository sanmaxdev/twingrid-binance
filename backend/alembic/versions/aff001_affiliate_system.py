"""Add affiliate system — commissions table + user override column.

Revision ID: aff001_affiliate_system
Revises: cc01fee0system
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'aff001_affiliate_system'
down_revision = 'cc01fee0system'
branch_labels = None
depends_on = None


def upgrade():
    # Affiliate commissions table
    op.create_table(
        'affiliate_commissions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('referrer_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('referral_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('fee_tx_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('fee_transactions.id'), nullable=False),
        sa.Column('fee_amount', sa.Numeric(24, 8), nullable=False),
        sa.Column('commission_pct', sa.Numeric(8, 4), nullable=False),
        sa.Column('commission_amount', sa.Numeric(24, 8), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # Per-user affiliate commission override
    op.add_column('users', sa.Column('affiliate_commission_override', sa.Numeric(8, 4), nullable=True))


def downgrade():
    op.drop_column('users', 'affiliate_commission_override')
    op.drop_table('affiliate_commissions')
