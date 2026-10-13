"""add_display_name_to_users

Revision ID: e95609140ee7
Revises: 914a5f02282a
Create Date: 2026-10-13 18:29:35.667358

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e95609140ee7'
down_revision: Union[str, Sequence[str], None] = '914a5f02282a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('display_name', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'display_name')
