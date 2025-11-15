from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db.models import Todo
from app.db.session import SessionLocal


async def init_db() -> None:
    async with SessionLocal() as session:
        existing = await session.scalar(select(Todo.id))
        if existing is not None:
            return

        session.add_all(
            [
                Todo(title="Ship tiny boilerplate", completed=False),
                Todo(title="Polish DX", completed=False),
                Todo(title="Celebrate", completed=False),
            ]
        )
        await session.commit()


def main() -> None:
    asyncio.run(init_db())


if __name__ == "__main__":
    main()
