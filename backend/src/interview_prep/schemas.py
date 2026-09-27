from typing import Literal

from pydantic import BaseModel, Field


AnswerMode = Literal["text", "diagram"]


class Profile(BaseModel):
    candidate_level: str = Field(description="e.g. junior, mid, senior")
    skills: list[str]
    projects: list[str] = Field(description="One-line summaries of notable projects")
    jd_requirements: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list, description="JD needs missing from resume")


class PlanTopic(BaseModel):
    topic: str
    weight: int = Field(ge=1, le=5)
    difficulty: str = Field(description="easy | medium | hard")


class Plan(BaseModel):
    topics: list[PlanTopic]
    num_questions: int


class Question(BaseModel):
    question: str
    rationale: str = Field(description="Why this question is being asked of this candidate")
    expected_signals: list[str] = Field(
        description="2-4 concrete things a satisfying answer must demonstrate"
    )
    topic: str
    difficulty: str
    # A candidate answers most questions with prose. Some — system design, database schema,
    # a data flow — are much clearer as a diagram, so those get a canvas alongside the text.
    # The model decides per-question; the client renders the canvas when this is 'diagram'.
    answer_mode: AnswerMode = Field(
        default="text",
        description="'text' for prose answers; 'diagram' when the candidate should draw "
        "a diagram (system design, ER, data flow, architecture, sequence, state).",
    )
    canvas_hint: str | None = Field(
        default=None,
        description="When answer_mode is 'diagram', one short line naming what to draw "
        "(e.g. 'high-level system design with the main services and their data flow'). "
        "Omitted otherwise.",
    )


class Evaluation(BaseModel):
    score: int = Field(ge=1, le=5)
    signals_met: list[str]
    signals_missed: list[str]
    satisfied: bool
    feedback: str


class TopicScore(BaseModel):
    topic: str
    score: float


class ReportNarrative(BaseModel):
    """What the LLM writes. Numbers are computed in code, never by the model."""

    strengths: list[str]
    gaps: list[str]
    recommendations: list[str]
    summary: str


class Report(ReportNarrative):
    overall_score: float
    topic_scores: list[TopicScore]
