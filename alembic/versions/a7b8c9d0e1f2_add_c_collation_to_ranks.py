"""add_c_collation_to_ranks

Revision ID: a7b8c9d0e1f2
Revises: e95609140ee7
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'e95609140ee7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to use C collation for deterministic Lexorank byte-order sorting."""
    op.execute('ALTER TABLE columns ALTER COLUMN rank TYPE varchar(64) COLLATE "C"')
    op.execute('ALTER TABLE cards ALTER COLUMN rank TYPE varchar(64) COLLATE "C"')


def downgrade() -> None:
    """Downgrade schema."""
    op.execute('ALTER TABLE columns ALTER COLUMN rank TYPE varchar(64)')
    op.execute('ALTER TABLE cards ALTER COLUMN rank TYPE varchar(64)')
