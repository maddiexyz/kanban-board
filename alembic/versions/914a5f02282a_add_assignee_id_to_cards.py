"""add_assignee_id_to_cards

Revision ID: 914a5f02282a
Revises: cad9e465dbc0
Create Date: 2026-10-13 17:54:05.293891

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '914a5f02282a'
down_revision: Union[str, Sequence[str], None] = 'cad9e465dbc0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('cards', sa.Column('assignee_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_cards_assignee_id_users', 'cards', 'users', ['assignee_id'], ['id'], ondelete='SET NULL')
    op.create_index('idx_cards_assignee', 'cards', ['assignee_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_cards_assignee', table_name='cards')
    op.drop_constraint('fk_cards_assignee_id_users', 'cards', type_='foreignkey')
    op.drop_column('cards', 'assignee_id')
