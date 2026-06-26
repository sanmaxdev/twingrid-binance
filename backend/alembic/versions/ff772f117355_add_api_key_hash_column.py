"""add_api_key_hash_column

Revision ID: ff772f117355
Revises: dddd601388cc
Create Date: 2026-04-26 09:54:12.677614

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'ff772f117355'
down_revision: Union[str, None] = 'dddd601388cc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add column as nullable first (existing rows won't have a value)
    op.add_column('accounts', sa.Column('api_key_hash', sa.String(length=64), nullable=True))
    # Backfill existing rows with a unique placeholder based on their ID
    op.execute("UPDATE accounts SET api_key_hash = encode(sha256(id::text::bytea), 'hex') WHERE api_key_hash IS NULL")
    # Now make it NOT NULL
    op.alter_column('accounts', 'api_key_hash', nullable=False)
    # Add unique index
    op.create_index(op.f('ix_accounts_api_key_hash'), 'accounts', ['api_key_hash'], unique=True)

def downgrade() -> None:
    op.drop_index(op.f('ix_accounts_api_key_hash'), table_name='accounts')
    op.drop_column('accounts', 'api_key_hash')
