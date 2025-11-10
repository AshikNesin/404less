"""Add auth tables (users and magic_links)

Revision ID: 26fb4ef30b18
Revises: 20240417_0001
Create Date: 2025-11-10 20:11:22.629667

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26fb4ef30b18'
down_revision: str | None = '20240417_0001'
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # Create magic_links table
    op.create_table(
        'magic_links',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_magic_links_id'), 'magic_links', ['id'], unique=False)
    op.create_index(op.f('ix_magic_links_token'), 'magic_links', ['token'], unique=True)


def downgrade() -> None:
    # Drop magic_links table
    op.drop_index(op.f('ix_magic_links_token'), table_name='magic_links')
    op.drop_index(op.f('ix_magic_links_id'), table_name='magic_links')
    op.drop_table('magic_links')

    # Drop users table
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')