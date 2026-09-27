import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Groq is primary; any LangChain provider works by changing these.
    llm_provider: str = "groq"
    llm_model: str = "openai/gpt-oss-120b"
    llm_fallback_model: str | None = None  # "provider:model", e.g. "groq:llama-3.1-8b-instant"
    llm_temperature: float = 0.4

    groq_api_key: str | None = None

    # App DB, interview turns (MCP store) and LangGraph checkpoints. sqlite:///... (default) or postgresql+psycopg://user:pw@host/db
    database_url: str = "sqlite:///app.db"

    jwt_secret: str = "dev-only-change-me"  # must be >= 32 chars; validated on startup
    jwt_expire_minutes: int = 60 * 24
    # Explicit browser origins allowed to call the API (add your deployed frontend here).
    cors_origins: list[str] = ["http://localhost:3000"]
    # Plus any localhost / 127.0.0.1 port, so the frontend works whichever host name and port
    # Next.js ends up on during development. Set to "" to allow only cors_origins.
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    upload_dir: str = "uploads"
    max_upload_bytes: int = 5 * 1024 * 1024
    stt_model: str = "whisper-large-v3-turbo"
    tts_model: str = "canopylabs/orpheus-v1-english"
    tts_voice: str = "autumn"
    max_followups: int = 2
    default_num_questions: int = 6


settings = Settings()

# Provider SDKs read keys from the process environment, not from our .env parsing.
if settings.groq_api_key:
    os.environ.setdefault("GROQ_API_KEY", settings.groq_api_key)


def check_secrets() -> list[str]:
    """Configuration problems worth blocking or shouting about at startup."""
    problems = []
    if settings.jwt_secret == "dev-only-change-me":
        problems.append("JWT_SECRET is still the placeholder value.")
    elif len(settings.jwt_secret) < 32:
        problems.append(
            f"JWT_SECRET is only {len(settings.jwt_secret)} characters; HS256 needs at least 32."
        )
    if not settings.groq_api_key and settings.llm_provider == "groq":
        problems.append("GROQ_API_KEY is not set, so no interview can be generated.")
    return problems
