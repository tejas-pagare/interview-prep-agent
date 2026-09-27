from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import settings

_kwargs = (
    {"connect_args": {"check_same_thread": False}}
    if settings.database_url.startswith("sqlite")
    # Managed Postgres providers (Neon, Supabase, RDS proxies) drop idle SSL
    # sockets; pre_ping validates the connection before each checkout, and
    # pool_recycle rotates connections before the provider's idle timeout.
    else {"pool_pre_ping": True, "pool_recycle": 300}
)
engine = create_engine(settings.database_url, **_kwargs)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Interview(Base):
    __tablename__ = "interviews"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="")
    focus_prompt: Mapped[str] = mapped_column(String(2000), default="")
    has_jd: Mapped[bool] = mapped_column(default=False)
    num_questions: Mapped[int] = mapped_column(default=6)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | completed
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def init_db() -> None:
    Base.metadata.create_all(engine)


def get_db():
    with SessionLocal() as session:
        yield session


__all__ = ["Base", "User", "Interview", "Session", "SessionLocal", "engine", "init_db", "get_db"]
