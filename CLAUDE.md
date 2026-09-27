# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Backend (from `backend/`, uses uv): `uv run uvicorn interview_prep.main:app --port 8000`; tests `uv run pytest` (single: `uv run pytest tests/test_api.py::test_full_interview_flow`); CLI driver `uv run python -m interview_prep.cli resume.pdf --focus "..."`
- Frontend (from `frontend/`): `npm run dev`, `npm run build`. This is Next.js 16 — it differs from older versions, so check `node_modules/next/dist/docs/` before using an API. Notably `middleware.ts` is deprecated and renamed to `proxy.ts` (exporting `proxy`).
- Config via `backend/.env` (see `.env.example`); pydantic-settings in `config.py` re-exports `GROQ_API_KEY` to the environment because provider SDKs read it from there.

## Architecture
- The interview is one LangGraph (`graph/builder.py`, nodes in `graph/nodes.py`): ingest → profile → plan → generate_question → `await_answer` (`interrupt()`) → evaluate → follow-up (max 2) or advance → final_report. Checkpointer (`checkpointer.py`: SQLite or Postgres from `DATABASE_URL`) keyed by `thread_id = interview_id` makes sessions resumable across requests/restarts.
- LLMs are stateless by design: every question stores `rationale` + `expected_signals`, and the evaluator/report see only those records, not chat history. Keep that invariant.
- Numbers are computed in code, not by the LLM: `satisfied = score >= 4` and report scores (`compute_scores`). The LLM writes only the narrative (`ReportNarrative`).
- Tools go through an MCP stdio server (`mcp_server/server.py`, launched as a subprocess by `mcp_client.py`, which forwards `os.environ` so `DATABASE_URL` etc. reach it). Turns are stored by the MCP `save_turn` tool in the same database as the app (`DATABASE_URL`: users, interviews, turns, LangGraph checkpoints).
- API (`api/`): auth (JWT), interviews (ownership checked on every route; per-interview lock; `/retry` continues a run that failed mid-step), voice (Groq Whisper STT / Orpheus TTS).
- Tests use a fake `structured()` LLM (`tests/test_graph.py`) and `conftest.py` redirects all storage to a temp dir before imports.

## Frontend auth
- Routes: `/` is the public landing page, `/login` and `/register` both render `components/AuthForm.tsx`, and everything under the `app/(app)/` route group (`/dashboard`, `/interview/[id]`) requires a session.
- Route protection has two halves. `frontend/proxy.ts` runs on the server before a protected page renders and redirects to `/login?next=…` when the `ip_token` cookie is absent (and bounces a signed-in visitor off `/login` and `/register` to `/dashboard`); `components/AuthGuard.tsx`, applied through `app/(app)/layout.tsx`, then renders nothing until it confirms a present, unexpired token, so protected content never flashes. Put any new protected page inside `app/(app)/` and it is covered automatically.
- Neither half is a security boundary — the cookie is JS-readable and only checked for presence. The API is the real enforcement: every interview route requires a valid JWT and scopes queries to the owning user.
- `lib/auth.ts` owns the session: localStorage for the `Authorization` header, mirrored into a cookie for `proxy.ts`, plus client-side expiry decoding. `lib/api.ts` turns a failed `fetch` into `ApiError` with status 0 (`isOffline`) so a stopped backend reads as "cannot reach the server" rather than "Failed to fetch", and a 401 on a non-`/auth/` route clears the session and bounces to sign-in.

## Frontend design
- One light theme: white surfaces with a green primary (`--brand`), defined as tokens at the top of `app/globals.css`. There is no dark mode — the palette is deliberately light-only. Colour carries meaning: green also marks a passing score, amber a partial one, red a low one (`.sc.hi/.mid/.lo`).
- Type pairs Instrument Serif (`--display`, headings and figures) with Inter (`--sans`, UI text).
- Landing-page motion is deliberately restrained: `.rise` with `.d1`–`.d5` staggers the hero on load, and `components/Reveal.tsx` fades sections in once via IntersectionObserver. Everything is disabled under `prefers-reduced-motion`.
- The landing page's "How it works" (`components/SystemFlow.tsx`) is a stepper driving a diagram that mirrors `graph/builder.py`, both loops included, with a wide layout and a vertical phone layout (≤600px). Changing the graph's nodes or edges means updating `NODES`/`EDGES` and both layouts there, or the landing page describes a pipeline that no longer exists.

## CORS
A rejected preflight is invisible in the browser — it surfaces only as a failed `fetch`, which the UI
reports as "cannot reach the server" — so this caused a hard-to-diagnose "registration is broken" bug.
`cors_origin_regex` now allows localhost and 127.0.0.1 on **any** port, `cors_origins` holds explicit
extra origins, and `main.py` logs a warning naming any origin whose preflight is rejected. Serving the
frontend from a LAN address needs that address added to `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL`
pointed at the same host. `tests/test_api.py::test_cors_preflight_allows_any_local_origin` pins this.

## Report breakdown
`GET /interviews/{id}` returns each answered turn with `rationale`, `expected_signals`, `signals_met`
and `signals_missed`; `components/QuestionBreakdown.tsx` groups follow-ups under the main question they
came from and renders why each was asked, the criteria, covered vs missing signals, and the verdict.
The *pending* question deliberately exposes only `kind`, `topic` and `question` — never its criteria,
or the candidate could game the answer. A test pins both halves of that.

## Restarting the frontend
`pkill -f "next start"` does **not** match the running process (it is `next-server`), so a stale server
survives and keeps serving an old build whose CSS URL then 500s — the page renders unstyled. Kill by
port instead: `lsof -ti:3000 | xargs kill -9`.
