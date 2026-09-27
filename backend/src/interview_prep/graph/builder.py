from functools import partial

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from . import nodes
from .state import InterviewState


def build_graph(tools: dict, checkpointer=None):
    """Interview state machine. `tools` = MCP tools by name; checkpointer keyed by thread_id=interview_id."""
    g = StateGraph(InterviewState)
    g.add_node("ingest", partial(nodes.ingest, tools=tools))
    g.add_node("build_profile", nodes.build_profile)
    g.add_node("plan_interview", nodes.plan_interview)
    g.add_node("generate_question", partial(nodes.generate_question, tools=tools))
    g.add_node("await_answer", nodes.await_answer)
    g.add_node("evaluate_answer", partial(nodes.evaluate_answer, tools=tools))
    g.add_node("generate_followup", nodes.generate_followup)
    g.add_node("advance", nodes.advance)
    g.add_node("final_report", nodes.final_report)

    g.add_edge(START, "ingest")
    g.add_edge("ingest", "build_profile")
    g.add_edge("build_profile", "plan_interview")
    g.add_edge("plan_interview", "generate_question")
    g.add_edge("generate_question", "await_answer")
    g.add_conditional_edges("await_answer", nodes.route_after_answer, ["evaluate_answer", "final_report"])
    g.add_conditional_edges("evaluate_answer", nodes.route_after_eval, ["generate_followup", "advance"])
    g.add_edge("generate_followup", "await_answer")
    g.add_conditional_edges("advance", nodes.route_after_advance, ["generate_question", "final_report"])
    g.add_edge("final_report", END)
    return g.compile(checkpointer=checkpointer or InMemorySaver())
