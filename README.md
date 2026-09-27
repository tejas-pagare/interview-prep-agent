# AI Interview Prep

Students upload a resume (plus an optional job description and a focus prompt) and get a mock interview:
one question at a time, follow-ups on weak answers, and a final evaluation.

**Key idea:** LLM calls are stateless, so every question is stored with a *rationale* and *expected signals*.
The evaluator judges an answer against those, and the final report is built from them.

## Stack
- **LangGraph** – interview state machine (`backend/src/interview_prep/graph`), durable checkpoints, `interrupt()` waits for the student's answer
- **LangChain** – provider-agnostic models (`init_chat_model`), Groq primary; change `LLM_PROVIDER`/`LLM_MODEL` to swap
- **MCP** – custom tool server (`mcp_server/`): resume parsing, JD analysis, question bank, turn storage; consumed via `langchain-mcp-adapters`
- **FastAPI** + SQLAlchemy (SQLite default, Postgres via `DATABASE_URL`), JWT auth
- **Next.js** frontend with voice: Groq Whisper (speech-to-text) and Groq Orpheus / browser speech (text-to-speech)

## Run
```bash
# backend
cd backend
cp .env.example .env        # set GROQ_API_KEY and JWT_SECRET
uv run uvicorn interview_prep.main:app --port 8000

# frontend
cd frontend
cp .env.local.example .env.local
npm run dev                 # http://localhost:3000

# Postgres (e.g. Neon): set DATABASE_URL in backend/.env, scheme must be postgresql+psycopg://
# local alternative: docker compose up -d
```
CLI without the web app: `uv run python -m interview_prep.cli resume.pdf --jd jd.txt --focus "backend"`.

## Tests
`cd backend && uv run pytest` (uses a fake LLM; no API key needed).

## Routes
`/` public landing page · `/login` and `/register` · `/dashboard` and `/interview/[id]` require a session.

## Auth
Email and password with a JWT (bcrypt-hashed passwords). Protected routes are gated server-side by
`frontend/proxy.ts` and client-side by `AuthGuard`; the API independently requires a valid token on
every interview route and scopes every query to the signed-in user.

## Notes
- Scores are computed in code (turn score → topic mean → overall), not by the LLM; `satisfied` = score ≥ 4.
- Server TTS uses `canopylabs/orpheus-v1-english`, which requires a Groq org admin to accept the model terms at
  console.groq.com; until then the UI falls back to browser speech.
