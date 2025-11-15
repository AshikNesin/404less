import asyncio
from sqlalchemy import text
from app.db.session import engine

async def create_magic_links_table():
    async with engine.begin() as conn:
        # Create magic_links table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS magic_links (
                id SERIAL PRIMARY KEY,
                token VARCHAR(255) UNIQUE NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN DEFAULT FALSE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
        """))

        # Create indexes
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_magic_links_id ON magic_links (id)
        """))

        await conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ix_magic_links_token ON magic_links (token)
        """))

        print("Magic links table created successfully!")

if __name__ == "__main__":
    asyncio.run(create_magic_links_table())