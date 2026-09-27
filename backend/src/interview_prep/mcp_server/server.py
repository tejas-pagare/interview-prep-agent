"""MCP server exposing interview tools. Run: python -m interview_prep.mcp_server.server (stdio)."""
import re
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from . import question_bank, store

mcp = FastMCP("interview-tools")


@mcp.tool()
def parse_resume(file_path: str) -> str:
    """Extract plain text from a resume file (.pdf, .docx, .txt)."""
    path = Path(file_path)
    if not path.is_file():
        raise ValueError(f"Resume file not found: {file_path}")
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        return "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    if suffix == ".docx":
        from docx import Document

        return "\n".join(p.text for p in Document(path).paragraphs)
    if suffix in {".txt", ".md"}:
        return path.read_text()
    raise ValueError(f"Unsupported resume type: {suffix}")


@mcp.tool()
def analyze_jd(text: str) -> dict:
    """Split a job description into requirement-like lines and detect seniority hints."""
    lines = [re.sub(r"^[\-\*•\d\.\)\s]+", "", l).strip() for l in text.splitlines()]
    bullets = [l for l in lines if 15 < len(l) < 220]
    lowered = text.lower()
    seniority = next(
        (s for s in ("principal", "staff", "senior", "lead", "junior", "intern") if s in lowered),
        "mid",
    )
    return {"seniority_hint": seniority, "requirement_lines": bullets[:25]}


@mcp.tool()
def search_question_bank(topic: str, difficulty: str | None = None) -> list[dict]:
    """Return seed questions for a topic to ground question generation."""
    return question_bank.search(topic, difficulty)


@mcp.tool()
def save_turn(interview_id: str, turn: dict) -> int:
    """Persist a turn (question, rationale, expected signals, answer, evaluation)."""
    return store.add_turn(interview_id, turn)


@mcp.tool()
def get_interview_history(interview_id: str) -> list[dict]:
    """Return prior turns of an interview (compact) for dedup and difficulty adaptation."""
    return [
        {k: t.get(k) for k in ("topic", "question", "score", "satisfied")}
        for t in store.list_turns(interview_id)
    ]


@mcp.resource("interview://{interview_id}/turns")
def interview_turns(interview_id: str) -> list[dict]:
    """Full stored turns for an interview."""
    return store.list_turns(interview_id)


if __name__ == "__main__":
    mcp.run()
