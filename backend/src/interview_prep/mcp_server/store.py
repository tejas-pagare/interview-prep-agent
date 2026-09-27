"""Turn storage used by the MCP tools; lives in the same database as the app (DATABASE_URL)."""
from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, create_engine, insert, select

from ..config import settings

_kwargs = (
    {"connect_args": {"check_same_thread": False}}
    if settings.database_url.startswith("sqlite")
    else {"pool_pre_ping": True, "pool_recycle": 300}
)
_engine = create_engine(settings.database_url, **_kwargs)
_meta = MetaData()
turns = Table(
    "turns", _meta,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("interview_id", String(32), nullable=False, index=True),
    Column("data", JSON, nullable=False),
)
_ready = False


def _init() -> None:
    global _ready
    if not _ready:
        _meta.create_all(_engine)
        _ready = True


def add_turn(interview_id: str, turn: dict) -> int:
    _init()
    with _engine.begin() as c:
        return c.execute(insert(turns).values(interview_id=interview_id, data=turn)).inserted_primary_key[0]


def list_turns(interview_id: str) -> list[dict]:
    _init()
    with _engine.connect() as c:
        rows = c.execute(select(turns.c.data).where(turns.c.interview_id == interview_id).order_by(turns.c.id))
        return [r[0] for r in rows]
