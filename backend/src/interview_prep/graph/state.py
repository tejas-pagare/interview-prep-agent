from typing import Any, TypedDict


class InterviewState(TypedDict, total=False):
    interview_id: str
    resume_text: str
    resume_path: str
    jd_text: str
    focus_prompt: str
    num_questions: int

    jd_analysis: dict
    profile: dict
    plan: dict
    schedule: list[dict]  # one {topic, difficulty} per main question

    question_index: int
    followup_count: int
    current_question: dict[str, Any]  # question, rationale, expected_signals, topic, difficulty, kind, answer_mode, canvas_hint
    current_answer: str
    # A diagram-mode question also carries a serialised whiteboard: {"nodes": [...], "edges": [...]}.
    # The candidate may also write a text explanation; both are graded together.
    current_diagram: dict[str, Any] | None
    evaluation: dict

    turns: list[dict]  # self-describing records: question + rationale + signals + answer + evaluation
    ended: bool
    report: dict
