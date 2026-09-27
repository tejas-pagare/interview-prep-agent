"""Drive an interview from the terminal: python -m interview_prep.cli resume.pdf [--jd jd.txt] [--focus "..."]"""
import argparse
import asyncio
import json
import uuid
from pathlib import Path

from langgraph.types import Command

from .graph.builder import build_graph
from .mcp_client import load_tools


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("resume")
    p.add_argument("--jd")
    p.add_argument("--focus", default="")
    p.add_argument("-n", type=int, default=None, help="number of main questions")
    a = p.parse_args()

    graph = build_graph(await load_tools())
    iid = uuid.uuid4().hex[:8]
    cfg = {"configurable": {"thread_id": iid}}
    state = {
        "interview_id": iid,
        "resume_path": str(Path(a.resume).resolve()),
        "jd_text": Path(a.jd).read_text() if a.jd else "",
        "focus_prompt": a.focus,
        "num_questions": a.n,
    }
    out = await graph.ainvoke(state, cfg)
    while "__interrupt__" in out:
        q = out["__interrupt__"][0].value
        print(f"\n[{q['kind']} | {q['topic']}] {q['question']}\n(type /end to finish)")
        out = await graph.ainvoke(Command(resume=input("> ")), cfg)
    print("\n=== REPORT ===")
    print(json.dumps(out["report"], indent=2))


if __name__ == "__main__":
    asyncio.run(main())
