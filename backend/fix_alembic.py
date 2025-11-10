import asyncio
from sqlalchemy import text
from app.db.session import engine

async def fix_alembic():
    async with engine.begin() as conn:
        # Check current version
        result = await conn.execute(text("SELECT version_num FROM alembic_version"))
        current = result.scalar()
        print(f"Current version: {current}")

        # Set to latest version
        await conn.execute(text("UPDATE alembic_version SET version_num = '26fb4ef30b18'"))
        print("Set version to 26fb4ef30b18 (latest auth migration)")

if __name__ == "__main__":
    asyncio.run(fix_alembic())