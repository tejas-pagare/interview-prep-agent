import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from langgraph.types import Command
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import Interview, User, get_db
from ..graph.nodes import END_COMMAND
from ..mcp_server import store
from .auth import current_user

log = logging.getLogger(__name__)
router = APIRouter(prefix="/interviews", tags=["interviews"])

ALLOWED_RESUME_EXT = {".pdf", ".docx", ".txt", ".md"}
MAX_ANSWER_CHARS = 10_000
_locks: dict[str, asyncio.Lock] = {}  # serialise steps per interview (double-submit safety)


MAX_NODES = 60
MAX_EDGES = 200
MAX_LABEL_CHARS = 120


class DiagramNode(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(default="", max_length=MAX_LABEL_CHARS)
    x: float = 0
    y: float = 0


class DiagramEdge(BaseModel):
    id: str = Field(min_length=1, max_length=60)
    from_: str = Field(alias="from", min_length=1, max_length=40)
    to: str = Field(min_length=1, max_length=40)
    label: str | None = Field(default=None, max_length=MAX_LABEL_CHARS)

    model_config = {"populate_by_name": True}


class Diagram(BaseModel):
    """A candidate's whiteboard: labelled boxes with directed connections."""
    nodes: list[DiagramNode] = Field(default_factory=list, max_length=MAX_NODES)
    edges: list[DiagramEdge] = Field(default_factory=list, max_length=MAX_EDGES)


class AnswerIn(BaseModel):
    # For a diagram question, the explanation may be empty as long as a diagram is present.
    # The route enforces "at least one of them is non-empty".
    answer: str = Field(default="", max_length=MAX_ANSWER_CHARS)
    diagram: Diagram | None = None


def _cfg(interview_id: str) -> dict:
    return {"configurable": {"thread_id": interview_id}}


def _owned(db: Session, user: User, interview_id: str) -> Interview:
    row = db.scalar(select(Interview).where(Interview.id == interview_id, Interview.user_id == user.id))
    if not row:
        raise HTTPException(404, "Interview not found")
    return row


async def _payload(request: Request, db: Session, row: Interview, *, with_feedback: bool = False) -> dict:
    """Build the client-facing view of the interview from the graph checkpoint."""
    snap = await request.app.state.graph.aget_state(_cfg(row.id))
    values = snap.values or {}
    report = values.get("report")
    if report and row.status != "completed":
        row.status, row.report, row.overall_score = "completed", report, report["overall_score"]
        db.commit()

    question = None
    if snap.interrupts:
        v = snap.interrupts[0].value
        # answer_mode / canvas_hint let the client decide whether to show a canvas. The
        # rationale + expected signals stay hidden until the turn is answered.
        question = {
            "kind": v["kind"], "topic": v["topic"], "question": v["question"],
            "answer_mode": v.get("answer_mode", "text"),
            "canvas_hint": v.get("canvas_hint"),
        }
    failed_step = bool(snap.next) and snap.next[0] != "await_answer" and not report

    out = {
        "id": row.id,
        "status": row.status,
        "question": question,
        "progress": {
            "answered_main": min(values.get("question_index", 0), row.num_questions),
            "total": row.num_questions,
        },
        "needs_retry": failed_step,
        "report": report or row.report,
    }
    if with_feedback and values.get("evaluation") and not values.get("ended"):
        ev = values["evaluation"]
        out["feedback"] = {"score": ev["score"], "satisfied": ev["satisfied"], "feedback": ev["feedback"]}
    return out


async def _run(request: Request, interview_id: str, graph_input):
    async with _locks.setdefault(interview_id, asyncio.Lock()):
        try:
            await request.app.state.graph.ainvoke(graph_input, _cfg(interview_id))
        except Exception:
            log.exception("interview %s step failed", interview_id)
            raise HTTPException(502, "The AI provider failed on this step. Please retry.")


@router.post("", status_code=201)
async def create_interview(
    request: Request,
    resume: UploadFile = File(...),
    jd_text: str = Form("", max_length=20_000),
    focus_prompt: str = Form("", max_length=2_000),
    num_questions: int = Form(settings.default_num_questions, ge=1, le=15),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ext = Path(resume.filename or "").suffix.lower()
    if ext not in ALLOWED_RESUME_EXT:
        raise HTTPException(422, f"Resume must be one of: {', '.join(sorted(ALLOWED_RESUME_EXT))}")
    data = await resume.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "Resume file too large")
    if not data:
        raise HTTPException(422, "Resume file is empty")

    interview_id = uuid.uuid4().hex
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    path = upload_dir / f"{interview_id}{ext}"  # server-generated name; never trust client filename
    path.write_bytes(data)

    row = Interview(
        id=interview_id, user_id=user.id, focus_prompt=focus_prompt, has_jd=bool(jd_text.strip()),
        num_questions=num_questions, title=(focus_prompt.strip()[:60] or "General interview"),
    )
    db.add(row)
    db.commit()
    try:
        await _run(request, interview_id, {
            "interview_id": interview_id, "resume_path": str(path.resolve()), "jd_text": jd_text,
            "focus_prompt": focus_prompt, "num_questions": num_questions,
        })
    except HTTPException:
        db.delete(row)
        db.commit()
        path.unlink(missing_ok=True)
        raise
    return await _payload(request, db, row)


@router.get("")
def list_interviews(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Interview).where(Interview.user_id == user.id).order_by(Interview.created_at.desc())
    ).all()
    return [
        {"id": r.id, "title": r.title, "status": r.status, "overall_score": r.overall_score,
         "num_questions": r.num_questions, "created_at": r.created_at}
        for r in rows
    ]


@router.get("/{interview_id}")
async def get_interview(
    interview_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    row = _owned(db, user, interview_id)
    out = await _payload(request, db, row)
    out["title"], out["focus_prompt"] = row.title, row.focus_prompt
    # Answered turns carry the full record: why the question was asked, what a strong answer
    # had to show, and which of those signals landed. Safe to expose because every turn here
    # has already been answered — the pending question deliberately omits all of it.
    out["turns"] = [
        {
            k: t.get(k)
            for k in (
                "kind", "topic", "question", "rationale", "expected_signals",
                "answer", "score", "satisfied", "feedback", "signals_met", "signals_missed",
                "answer_mode", "canvas_hint", "diagram",
            )
        }
        for t in store.list_turns(interview_id)
    ]
    return out


@router.post("/{interview_id}/answer")
async def answer(
    interview_id: str, body: AnswerIn, request: Request,
    user: User = Depends(current_user), db: Session = Depends(get_db),
):
    row = _owned(db, user, interview_id)
    if row.status == "completed":
        raise HTTPException(409, "Interview already completed")
    snap = await request.app.state.graph.aget_state(_cfg(interview_id))
    if not snap.interrupts:
        raise HTTPException(409, "Previous step failed; call /retry" if snap.next else "No pending question")
    text = body.answer.strip()
    # by_alias serialises `from_` back to `from`, matching what the graph node expects.
    diagram = body.diagram.model_dump(by_alias=True) if body.diagram else None
    has_diagram = bool(diagram and (diagram["nodes"] or diagram["edges"]))
    # For a diagram question, either the drawing or an explanation is enough. For a
    # text question, we still require prose so /end and the empty-answer guard behave
    # the same as before.
    mode = snap.interrupts[0].value.get("answer_mode", "text")
    if mode == "diagram":
        if not text and not has_diagram:
            raise HTTPException(422, "Draw something or write an explanation before submitting")
    elif not text:
        raise HTTPException(422, "Answer is empty")
    await _run(request, interview_id, Command(resume={"answer": text, "diagram": diagram}))
    return await _payload(request, db, row, with_feedback=True)


@router.post("/{interview_id}/retry")
async def retry(
    interview_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Resume a run that stopped mid-step because the AI provider failed."""
    row = _owned(db, user, interview_id)
    snap = await request.app.state.graph.aget_state(_cfg(interview_id))
    if snap.interrupts or not snap.next:
        raise HTTPException(409, "Nothing to retry")
    await _run(request, interview_id, None)
    return await _payload(request, db, row, with_feedback=True)


@router.post("/{interview_id}/finish")
async def finish(
    interview_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    row = _owned(db, user, interview_id)
    if row.status == "completed":
        return await _payload(request, db, row)
    snap = await request.app.state.graph.aget_state(_cfg(interview_id))
    if not snap.interrupts:
        raise HTTPException(409, "Previous step failed; call /retry first")
    if not store.list_turns(interview_id):
        raise HTTPException(409, "Answer at least one question before finishing")
    await _run(request, interview_id, Command(resume={"answer": END_COMMAND, "diagram": None}))
    return await _payload(request, db, row)
