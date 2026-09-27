import os
import sys

from langchain_mcp_adapters.client import MultiServerMCPClient


def build_client() -> MultiServerMCPClient:
    """Custom interview MCP server over stdio; add third-party servers here (web search, fetch)."""
    return MultiServerMCPClient(
        {
            "interview": {
                "command": sys.executable,
                "args": ["-m", "interview_prep.mcp_server.server"],
                "transport": "stdio",
                "env": dict(os.environ),  # server needs DATABASE_URL, GROQ_API_KEY etc.
            }
        }
    )


async def load_tools() -> dict:
    """Return {tool_name: LangChain tool}."""
    tools = await build_client().get_tools()
    return {t.name: t for t in tools}
