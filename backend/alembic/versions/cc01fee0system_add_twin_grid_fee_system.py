"""add_twin_grid_fee_system

Revision ID: cc01fee0system
Revises: ff772f117355
Create Date: 2026-04-30 21:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'cc01fee0system'
down_revision: Union[str, None] = '7f35e75d56cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add balance columns to users
    op.add_column('users', sa.Column('twin_grid_balance', sa.Numeric(24, 8), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('fee_percentage_override', sa.Numeric(8, 4), nullable=True))

    # 2. Create fee_transactions table
    op.create_table(
        'fee_transactions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('basket_id', UUID(as_uuid=True), sa.ForeignKey('baskets.id'), nullable=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('amount', sa.Numeric(24, 8), nullable=False),
        sa.Column('balance_before', sa.Numeric(24, 8), nullable=False),
        sa.Column('balance_after', sa.Numeric(24, 8), nullable=False),
        sa.Column('fee_percentage', sa.Numeric(8, 4), nullable=True),
        sa.Column('basket_pnl', sa.Numeric(24, 8), nullable=True),
        sa.Column('note', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )
    op.create_index('idx_fee_tx_user', 'fee_transactions', ['user_id', 'created_at'])
    op.create_index('idx_fee_tx_basket', 'fee_transactions', ['basket_id'])
    op.create_index('idx_fee_tx_type', 'fee_transactions', ['type', 'created_at'])

    # 3. Create deposit_requests table
    op.create_table(
        'deposit_requests',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('amount', sa.Numeric(24, 8), nullable=False),
        sa.Column('tx_hash', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='PENDING'),
        sa.Column('reviewed_by', UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reject_reason', sa.Text, nullable=True),
        sa.Column('fee_transaction_id', UUID(as_uuid=True), sa.ForeignKey('fee_transactions.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_deposit_user', 'deposit_requests', ['user_id', 'created_at'])
    op.create_index('idx_deposit_status', 'deposit_requests', ['status'])

    # 4. Seed default platform settings for fee system
    op.execute("""
        INSERT INTO platform_settings (key, value, updated_at) VALUES
            ('twin_grid_fee_percentage', '20.0', now()),
            ('twin_grid_deposit_address', '"TRR4tBqskmJLRQHcJXAGGJmf54pSBJBQyr"', now()),
            ('twin_grid_min_deposit', '10.0', now()),
            ('twin_grid_min_balance_multiplier', '2.0', now()),
            ('twin_grid_fee_enabled', 'true', now())
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index('idx_deposit_status', table_name='deposit_requests')
    op.drop_index('idx_deposit_user', table_name='deposit_requests')
    op.drop_table('deposit_requests')

    op.drop_index('idx_fee_tx_type', table_name='fee_transactions')
    op.drop_index('idx_fee_tx_basket', table_name='fee_transactions')
    op.drop_index('idx_fee_tx_user', table_name='fee_transactions')
    op.drop_table('fee_transactions')

    op.drop_column('users', 'fee_percentage_override')
    op.drop_column('users', 'twin_grid_balance')

    op.execute("DELETE FROM platform_settings WHERE key IN ('twin_grid_fee_percentage', 'twin_grid_deposit_address', 'twin_grid_min_deposit', 'twin_grid_min_balance_multiplier', 'twin_grid_fee_enabled')")
