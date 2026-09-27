import pytest
from langgraph.types import Command

from interview_prep import schemas
from interview_prep.graph import nodes
from interview_prep.graph.builder import build_graph
from interview_prep.mcp_client import load_tools
from interview_prep.mcp_server import store




def fake_structured(evals, *, questions: list[schemas.Question] | None = None):
    """Canned LLM: returns objects per schema; evaluations come from the `evals` iterator.

    Pass `questions` to script the sequence of generated questions (e.g. one in diagram mode).
    """
    counter = {"q": 0}

    async def _fake(schema, system, human, model=None):
        if schema is schemas.Profile:
            return schemas.Profile(candidate_level="junior", skills=["python"], projects=["blog"])
        if schema is schemas.Plan:
            return schemas.Plan(
                topics=[schemas.PlanTopic(topic="backend", weight=1, difficulty="easy")], num_questions=2
            )
        if schema is schemas.Question:
            counter["q"] += 1
            if questions and counter["q"] <= len(questions):
                return questions[counter["q"] - 1]
            return schemas.Question(
                question=f"Q{counter['q']}?", rationale="because resume", expected_signals=["a", "b"],
                topic="backend", difficulty="easy",
            )
        if schema is schemas.Evaluation:
            return next(evals)
        if schema is schemas.ReportNarrative:
            return schemas.ReportNarrative(strengths=["s"], gaps=["g"], recommendations=["r"], summary="ok")
        raise AssertionError(schema)

    return _fake


def ev(satisfied):
    return schemas.Evaluation(
        score=4 if satisfied else 2, signals_met=["a"] if satisfied else [],
        signals_missed=[] if satisfied else ["a"], satisfied=satisfied, feedback="f",
    )


@pytest.mark.asyncio
async def test_followup_then_advance_then_report(monkeypatch, tmp_path):
    # Q1: main + 2 follow-ups all weak (cap hit -> advance); Q2 strong
    evals = iter([ev(False), ev(False), ev(False), ev(True)])
    monkeypatch.setattr(nodes, "structured", fake_structured(evals))

    tools = await load_tools()
    assert {"parse_resume", "analyze_jd", "search_question_bank", "save_turn"} <= set(tools)
    graph = build_graph(tools)
    cfg = {"configurable": {"thread_id": "i1"}}

    out = await graph.ainvoke(
        {"interview_id": "i1", "resume_text": "python dev", "jd_text": "- Build REST APIs in Python\n- Know SQL well",
         "focus_prompt": "backend", "num_questions": 2}, cfg)
    assert out["__interrupt__"][0].value["kind"] == "question"

    out = await graph.ainvoke(Command(resume="weak answer"), cfg)
    assert out["__interrupt__"][0].value["kind"] == "followup"      # follow-up 1
    out = await graph.ainvoke(Command(resume="still weak"), cfg)
    assert out["__interrupt__"][0].value["kind"] == "followup"      # follow-up 2
    out = await graph.ainvoke(Command(resume="weak again"), cfg)
    assert out["__interrupt__"][0].value["kind"] == "question"      # cap hit -> next main question
    out = await graph.ainvoke(Command(resume="good answer"), cfg)

    assert out["report"]["summary"] == "ok"
    assert len(out["turns"]) == 4
    assert len(store.list_turns("i1")) == 4                          # persisted via MCP save_turn
    assert all(t["rationale"] for t in out["turns"])
    # scores 2,2,2,4 all on topic "backend" -> computed in code, not by the LLM
    assert out["report"]["topic_scores"] == [{"topic": "backend", "score": 2.5}]
    assert out["report"]["overall_score"] == 2.5


def test_compute_scores_averages_topics_equally():
    turns = [{"topic": "a", "score": 1}, {"topic": "a", "score": 3}, {"topic": "b", "score": 5}]
    overall, topics = nodes.compute_scores(turns)
    assert [(t.topic, t.score) for t in topics] == [("a", 2.0), ("b", 5.0)]
    assert overall == 3.5
    assert nodes.compute_scores([]) == (0.0, [])


@pytest.mark.asyncio
async def test_user_can_end_early(monkeypatch, tmp_path):
    monkeypatch.setattr(nodes, "structured", fake_structured(iter([])))
    graph = build_graph(await load_tools())
    cfg = {"configurable": {"thread_id": "i2"}}
    await graph.ainvoke({"interview_id": "i2", "resume_text": "x", "num_questions": 3}, cfg)
    out = await graph.ainvoke(Command(resume="/end"), cfg)
    assert "report" in out


@pytest.mark.asyncio
async def test_diagram_question_flows_through_grader_and_turn(monkeypatch, tmp_path):
    """A diagram-mode question serialises the canvas into the evaluator's prompt and stores it."""
    seen: dict[str, str] = {}

    async def spy_structured(evals):
        base = fake_structured(evals, questions=[
            schemas.Question(
                question="Design a URL shortener at a high level.",
                rationale="tests system design",
                expected_signals=["ingress path", "storage choice"],
                topic="system design", difficulty="medium",
                answer_mode="diagram",
                canvas_hint="services and how a request flows",
            ),
        ])

        async def wrapper(schema, system, human, model=None):
            if schema is schemas.Evaluation:
                seen["eval_prompt"] = human
            return await base(schema, system, human, model)
        return wrapper

    monkeypatch.setattr(nodes, "structured", await spy_structured(iter([ev(True), ev(True)])))
    graph = build_graph(await load_tools())
    cfg = {"configurable": {"thread_id": "diag-1"}}
    out = await graph.ainvoke({"interview_id": "diag-1", "resume_text": "x", "num_questions": 1}, cfg)
    pending = out["__interrupt__"][0].value
    assert pending["answer_mode"] == "diagram" and pending["canvas_hint"]

    diagram = {
        "nodes": [
            {"id": "n1", "label": "Client", "x": 0, "y": 0},
            {"id": "n2", "label": "API gateway", "x": 100, "y": 0},
            {"id": "n3", "label": "Redis", "x": 200, "y": 0},
        ],
        "edges": [
            {"id": "e1", "from": "n1", "to": "n2", "label": "POST /shorten"},
            {"id": "e2", "from": "n2", "to": "n3"},
        ],
    }
    out = await graph.ainvoke(
        Command(resume={"answer": "gateway hits redis for the mapping", "diagram": diagram}), cfg
    )

    assert "Client" in seen["eval_prompt"] and "Redis" in seen["eval_prompt"]
    assert "[1] Client -> [2] API gateway" in seen["eval_prompt"]
    assert "POST /shorten" in seen["eval_prompt"]
    assert "3 box(es) and 2 arrow(s)" in seen["eval_prompt"]
    turn = out["turns"][0]
    assert turn["answer_mode"] == "diagram"
    assert turn["diagram"]["nodes"][0]["label"] == "Client"
    assert turn["diagram"]["edges"][0]["from"] == "n1"


@pytest.mark.asyncio
async def test_satisfaction_is_derived_from_score(monkeypatch, tmp_path):
    # LLM claims unsatisfied but scores 4 -> code overrides to satisfied, so no follow-up
    lying = schemas.Evaluation(score=4, signals_met=["a"], signals_missed=["b"], satisfied=False, feedback="f")
    monkeypatch.setattr(nodes, "structured", fake_structured(iter([lying, ev(True)])))
    graph = build_graph(await load_tools())
    cfg = {"configurable": {"thread_id": "i3"}}
    await graph.ainvoke({"interview_id": "i3", "resume_text": "x", "num_questions": 2}, cfg)
    out = await graph.ainvoke(Command(resume="answer"), cfg)
    assert out["__interrupt__"][0].value["kind"] == "question"
