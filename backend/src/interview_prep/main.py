import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, interviews, voice
from .checkpointer import open_checkpointer
from .config import check_secrets, settings
from .db import init_db
from .graph.builder import build_graph
from .mcp_client import load_tools


@asynccontextmanager
async def lifespan(app: FastAPI):
    for problem in check_secrets():
        logging.getLogger(__name__).error(
            "Configuration problem: %s  Fix it in backend/.env — generate a secret with: "
            "python3 -c 'import secrets; print(secrets.token_urlsafe(48))'", problem,
        )
    init_db()
    tools = await load_tools()
    async with open_checkpointer() as saver:
        app.state.graph = build_graph(tools, checkpointer=saver)
        yield


app = FastAPI(title="Interview Prep", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def explain_blocked_origin(request, call_next):
    """A rejected CORS preflight surfaces in the browser only as a failed fetch, so say why here."""
    response = await call_next(request)
    if request.method == "OPTIONS" and response.status_code == 400 and request.headers.get("origin"):
        logging.getLogger(__name__).warning(
            "CORS preflight rejected for origin %s — add it to CORS_ORIGINS in backend/.env "
            "(allowed: %s, plus localhost/127.0.0.1 on any port)",
            request.headers["origin"], settings.cors_origins,
        )
    return response
app.include_router(auth.router)
app.include_router(interviews.router)
app.include_router(voice.router)


@app.get("/health")
def health():
    return {"ok": True}
