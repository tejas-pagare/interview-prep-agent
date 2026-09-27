import json

from langgraph.types import interrupt

from ..config import settings
from ..schemas import Evaluation, Plan, Profile, Question, Report, ReportNarrative, TopicScore
from .llm import structured
from .state import InterviewState

END_COMMAND = "/end"
SATISFIED_MIN_SCORE = 4

# Topics where a diagram is usually the clearest answer. Matched against the topic name
# AND the generated question text, so we can force a canvas even when the model asks
# a system-design question under a differently-named topic.
DIAGRAM_HINT_KEYWORDS = (
    "system design", "architecture", "high-level design", "hld", "distributed system",
    "data flow", "dataflow", "sequence diagram", "state machine", "workflow",
    "er diagram", "entity-relationship", "database schema", "data model", "database design",
    "microservice", "component diagram", "url shorten", "design a", "design an",
    "sketch", "diagram", "draw",
)


def _topic_suggests_diagram(topic: str, difficulty: str = "") -> bool:
    t = (topic or "").lower()
    return any(k in t for k in DIAGRAM_HINT_KEYWORDS)


def _question_suggests_diagram(question: str) -> bool:
    """Some questions are diagram-shaped even when the topic name isn't obvious."""
    q = (question or "").lower()
    strong = ("design a ", "design an ", "sketch ", "draw ", "diagram", "er model",
              "entity-relationship", "architecture of", "sequence", "state machine",
              "data flow", "system for", "how would you architect")
    return any(k in q for k in strong)


def _diagram_summary(diagram: dict | None) -> str:
    """Serialise the whiteboard into text the evaluator LLM can grade against.

    The candidate's canvas is a directed graph of labelled boxes. Positions are ignored —
    only the meaning (what the boxes are and how they connect) is graded. The output is
    written for a language model, not a human: components are listed under stable numeric
    ids so edges reference them unambiguously even when labels repeat, and the summary
    calls out isolated components explicitly so the model does not silently overlook them.
    """
    if not diagram:
        return ""
    raw_nodes = diagram.get("nodes") or []
    raw_edges = diagram.get("edges") or []
    if not raw_nodes and not raw_edges:
        return ""

    # Stable numeric ids so the prose reads well even when two boxes share a label.
    order = [n for n in raw_nodes if n.get("id")]
    id_to_num = {n["id"]: i + 1 for i, n in enumerate(order)}

    def name(n: dict) -> str:
        label = (n.get("label") or "").strip() or "unlabelled"
        return f"[{id_to_num[n['id']]}] {label}"

    edges: list[tuple[dict, dict, dict, str]] = []
    for e in raw_edges:
        src = next((n for n in order if n["id"] == e.get("from")), None)
        dst = next((n for n in order if n["id"] == e.get("to")), None)
        if not src or not dst:
            continue
        edges.append((e, src, dst, (e.get("label") or "").strip()))

    incoming: dict[str, int] = {n["id"]: 0 for n in order}
    outgoing: dict[str, int] = {n["id"]: 0 for n in order}
    for _e, s, d, _l in edges:
        outgoing[s["id"]] += 1
        incoming[d["id"]] += 1

    parts = [
        f"The candidate drew a directed diagram with {len(order)} box(es) and {len(edges)} arrow(s).",
        "Components:\n" + "\n".join(f"- {name(n)}" for n in order),
    ]
    if edges:
        parts.append(
            "Connections (arrow direction = data or control flow, source -> target):\n"
            + "\n".join(
                f"- {name(s)} -> {name(d)}" + (f"  (label: {lbl})" if lbl else "")
                for _e, s, d, lbl in edges
            )
        )
    isolated = [name(n) for n in order if incoming[n["id"]] == 0 and outgoing[n["id"]] == 0]
    if isolated:
        parts.append("Isolated boxes (no arrows in or out): " + ", ".join(isolated))
    unlabelled = sum(1 for n in order if not (n.get("label") or "").strip())
    if unlabelled:
        parts.append(f"Note: {unlabelled} box(es) were left unlabelled — treat those as unspecified.")
    return "\n\n".join(parts)


def compute_scores(turns: list[dict]) -> tuple[float, list[TopicScore]]:
    """Mean turn score per topic (follow-ups included), overall = mean of topic scores."""
    by_topic: dict[str, list[int]] = {}
    for t in turns:
        by_topic.setdefault(t["topic"], []).append(t["score"])
    topic_scores = [TopicScore(topic=k, score=round(sum(v) / len(v), 2)) for k, v in by_topic.items()]
    overall = round(sum(t.score for t in topic_scores) / len(topic_scores), 2) if topic_scores else 0.0
    return overall, topic_scores


async def call_tool(tools: dict, name: str, **args):
    """Invoke an MCP tool and normalise the adapter's return shape into Python data."""
    result = await tools[name].ainvoke(args)
    if isinstance(result, list):  # list of content blocks
        result = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in result)
    if isinstance(result, str):
        try:
            return json.loads(result)
        except json.JSONDecodeError:
            return result
    return result


async def ingest(state: InterviewState, tools: dict) -> dict:
    update: dict = {"turns": [], "question_index": 0, "followup_count": 0, "ended": False}
    if not state.get("resume_text") and state.get("resume_path"):
        update["resume_text"] = await call_tool(tools, "parse_resume", file_path=state["resume_path"])
    if state.get("jd_text"):
        update["jd_analysis"] = await call_tool(tools, "analyze_jd", text=state["jd_text"])
    update.setdefault("num_questions", state.get("num_questions") or settings.default_num_questions)
    return update


async def build_profile(state: InterviewState) -> dict:
    jd = state.get("jd_text") or "(none provided)"
    hints = json.dumps(state.get("jd_analysis", {}))
    profile = await structured(
        Profile,
        "You analyse a candidate's resume against an optional job description for interview planning.",
        f"RESUME:\n{state['resume_text']}\n\nJOB DESCRIPTION:\n{jd}\n\nJD ANALYSIS HINTS:\n{hints}",
    )
    return {"profile": profile.model_dump()}


async def plan_interview(state: InterviewState) -> dict:
    n = state["num_questions"]
    plan = await structured(
        Plan,
        "You design mock technical interview plans. Weight topics by the student's focus request "
        "first, then the job description, then the resume. Start easier and ramp up.",
        f"PROFILE:\n{json.dumps(state['profile'])}\n\nSTUDENT FOCUS:\n{state.get('focus_prompt') or 'general'}"
        f"\n\nProduce a plan for exactly {n} questions.",
    )
    # Expand weighted topics into an ordered per-question schedule.
    pool = [t for t in plan.topics for _ in range(t.weight)] or plan.topics
    schedule = [
        {"topic": pool[i % len(pool)].topic, "difficulty": pool[i % len(pool)].difficulty}
        for i in range(n)
    ]
    return {"plan": plan.model_dump(), "schedule": schedule}


async def generate_question(state: InterviewState, tools: dict) -> dict:
    slot = state["schedule"][state["question_index"]]
    seeds = await call_tool(
        tools, "search_question_bank", topic=slot["topic"], difficulty=slot["difficulty"]
    )
    asked = [t["question"] for t in state["turns"]]
    diagram_nudge = _topic_suggests_diagram(slot["topic"], slot["difficulty"])
    q = await structured(
        Question,
        "You are an interviewer. Ask ONE question tailored to this candidate. Give the rationale "
        "(why you are asking it of them) and 2-4 expected signals: concrete things a satisfying "
        "answer must demonstrate. These will later be the only basis for judging the answer.\n\n"
        "The candidate can answer in prose OR on a diagram canvas (labelled boxes with "
        "directed arrows). Set answer_mode='diagram' ONLY when a picture is genuinely the "
        "clearest answer — system design, architecture, ER / database schema, data flow, "
        "a sequence or state machine. When you do, set canvas_hint to one short line naming "
        "exactly what to draw (e.g. 'the main services and how requests flow between them'). "
        "Prefer 'text' for everything else.",
        f"PROFILE:\n{json.dumps(state['profile'])}\n\nTOPIC: {slot['topic']}  DIFFICULTY: {slot['difficulty']}"
        f"\nSEED QUESTIONS (inspiration only): {json.dumps(seeds)}\nALREADY ASKED (do not repeat): {json.dumps(asked)}"
        f"\nHINT: this topic {'often' if diagram_nudge else 'usually does not'} calls for a diagram — decide for this specific question.",
    )
    payload = {**q.model_dump(), "kind": "question"}
    # The LLM is unreliable at self-flagging visual questions, so we override when the topic
    # or the question itself is clearly diagram-shaped. Users can also opt into a canvas
    # manually from the client, which is the ultimate fallback.
    if payload.get("answer_mode") != "diagram" and (
        diagram_nudge or _question_suggests_diagram(payload["question"])
    ):
        payload["answer_mode"] = "diagram"
        payload["canvas_hint"] = (
            payload.get("canvas_hint")
            or f"the main components for {slot['topic']} and how they connect"
        )
    return {"current_question": payload, "followup_count": 0}


async def await_answer(state: InterviewState) -> dict:
    cq = state["current_question"]
    # The client sees answer_mode + canvas_hint so it can show a canvas when needed.
    payload = {
        "question": cq["question"], "topic": cq["topic"], "kind": cq["kind"],
        "answer_mode": cq.get("answer_mode", "text"),
        "canvas_hint": cq.get("canvas_hint"),
    }
    resumed = interrupt(payload)
    # A candidate on a canvas returns {"answer": "...", "diagram": {...}}; a text-only
    # candidate returns a plain string. Handle both so old checkpoints still resume.
    if isinstance(resumed, dict):
        answer = str(resumed.get("answer", "") or "")
        diagram = resumed.get("diagram")
    else:
        answer = str(resumed or "")
        diagram = None
    return {
        "current_answer": answer,
        "current_diagram": diagram,
        "ended": answer.strip().lower() == END_COMMAND,
    }


async def evaluate_answer(state: InterviewState, tools: dict) -> dict:
    if state["ended"]:
        return {}
    cq = state["current_question"]
    diagram = state.get("current_diagram")
    diagram_txt = _diagram_summary(diagram)
    # For a diagram question, the picture *is* most of the answer. Judge the two together
    # and, when the canvas is empty, treat that as a much weaker answer than the same prose.
    if cq.get("answer_mode") == "diagram":
        rendered = (
            f"CANDIDATE DIAGRAM ({cq.get('canvas_hint') or 'the whiteboard'}):\n"
            f"{diagram_txt or '(empty — nothing was drawn)'}\n\n"
            f"CANDIDATE EXPLANATION:\n{state['current_answer'] or '(none)'}"
        )
        extra_rubric = (
            " A diagram question is judged mostly on the drawing: an empty canvas means "
            "signals related to structure and connections are not met. Prose alone does "
            "not substitute for the drawing they were asked to make."
        )
    else:
        rendered = f"CANDIDATE ANSWER:\n{state['current_answer']}"
        extra_rubric = ""
    ev = await structured(
        Evaluation,
        "You grade an interview answer. Judge ONLY against the expected signals given. "
        "Rubric: 5 = all signals met with depth; 4 = essential signals met, minor omissions; "
        "3 = partial; 2 = mostly missing; 1 = wrong or no answer. Be concise and honest."
        + extra_rubric,
        f"QUESTION: {cq['question']}\nWHY IT WAS ASKED: {cq['rationale']}\n"
        f"EXPECTED SIGNALS: {json.dumps(cq['expected_signals'])}\n\n{rendered}",
    )
    ev.satisfied = ev.score >= SATISFIED_MIN_SCORE  # decided in code so it always matches the score
    turn = {
        "index": len(state["turns"]),
        "kind": cq["kind"],
        "topic": cq["topic"],
        "difficulty": cq["difficulty"],
        "question": cq["question"],
        "rationale": cq["rationale"],
        "expected_signals": cq["expected_signals"],
        "answer_mode": cq.get("answer_mode", "text"),
        "canvas_hint": cq.get("canvas_hint"),
        "answer": state["current_answer"],
        "diagram": diagram,
        **ev.model_dump(),
    }
    await call_tool(tools, "save_turn", interview_id=state["interview_id"], turn=turn)
    return {"evaluation": ev.model_dump(), "turns": [*state["turns"], turn]}


async def generate_followup(state: InterviewState) -> dict:
    cq, ev = state["current_question"], state["evaluation"]
    diagram_txt = _diagram_summary(state.get("current_diagram"))
    # A follow-up on a diagram answer should reference what the candidate actually drew.
    # It stays in prose — one focused probe — even when the original was a whiteboard.
    context = (
        f"ORIGINAL QUESTION: {cq['question']}\n"
        f"ORIGINAL MODE: {cq.get('answer_mode', 'text')}\n"
        f"CANDIDATE EXPLANATION: {state['current_answer']}\n"
        + (f"CANDIDATE DIAGRAM:\n{diagram_txt}\n" if diagram_txt else "")
        + f"SIGNALS MISSED: {json.dumps(ev['signals_missed'])}\nTOPIC: {cq['topic']}"
    )
    q = await structured(
        Question,
        "You are an interviewer probing a weak answer. Ask ONE short follow-up that targets the "
        "missed signals only. Give its rationale and expected signals. Keep answer_mode='text' — "
        "the candidate should answer the follow-up in prose, referring to their diagram if any.",
        context,
    )
    return {
        "current_question": {
            **q.model_dump(),
            "topic": cq["topic"],
            "kind": "followup",
            # Follow-ups are always answered in prose, regardless of what the model returned.
            "answer_mode": "text",
            "canvas_hint": None,
        },
        "followup_count": state["followup_count"] + 1,
    }


async def advance(state: InterviewState) -> dict:
    return {"question_index": state["question_index"] + 1}


async def final_report(state: InterviewState) -> dict:
    records = [
        {k: t[k] for k in ("topic", "kind", "question", "rationale", "expected_signals",
                            "score", "signals_met", "signals_missed", "satisfied")}
        for t in state["turns"]
    ]
    overall, topic_scores = compute_scores(state["turns"])
    narrative = await structured(
        ReportNarrative,
        "You write a final interview evaluation. Each record says why the question was asked and "
        "which expected signals the candidate met or missed. Ground every point in those records. "
        "Do not invent scores; they are computed separately.",
        f"CANDIDATE PROFILE:\n{json.dumps(state['profile'])}\n\nRECORDS:\n{json.dumps(records)}"
        f"\n\nOVERALL SCORE (1-5, for context): {overall}",
    )
    report = Report(**narrative.model_dump(), overall_score=overall, topic_scores=topic_scores)
    return {"report": report.model_dump()}


# --- routing -------------------------------------------------------------
def route_after_answer(state: InterviewState) -> str:
    return "final_report" if state["ended"] else "evaluate_answer"


def route_after_eval(state: InterviewState) -> str:
    if not state["evaluation"]["satisfied"] and state["followup_count"] < settings.max_followups:
        return "generate_followup"
    return "advance"


def route_after_advance(state: InterviewState) -> str:
    return "final_report" if state["question_index"] >= state["num_questions"] else "generate_question"
