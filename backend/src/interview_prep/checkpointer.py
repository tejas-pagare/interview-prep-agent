from contextlib import asynccontextmanager

from .config import settings


@asynccontextmanager
async def open_checkpointer():
    """Durable LangGraph checkpointer matching DATABASE_URL (sqlite or postgres)."""
    url = settings.database_url
    if url.startswith("sqlite"):
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        path = url.removeprefix("sqlite:///") or "app.db"
        async with AsyncSqliteSaver.from_conn_string(path) as saver:
            yield saver
    else:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        # SQLAlchemy driver suffix (postgresql+psycopg://) -> plain libpq URL
        plain = url.replace("postgresql+psycopg://", "postgresql://")
        async with AsyncPostgresSaver.from_conn_string(plain) as saver:
            await saver.setup()
            yield saver
