import asyncio
from sqlalchemy import text
from app.db.session import engine

async def check_schema():
    async with engine.begin() as conn:
        # Check users table structure
        result = await conn.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users' AND table_schema = 'public'
            ORDER BY ordinal_position
        """))
        columns = result.fetchall()
        print("Users table structure:")
        for col in columns:
            print(f"  - {col[0]}: {col[1]} (nullable: {col[2]})")

        # Check if magic_links exists
        result = await conn.execute(text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'magic_links' AND table_schema = 'public'
            )
        """))
        magic_links_exists = result.scalar()
        print(f"\nMagic links table exists: {magic_links_exists}")

if __name__ == "__main__":
    asyncio.run(check_schema())