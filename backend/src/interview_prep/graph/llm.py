from functools import lru_cache

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel

from ..config import settings


def _build(spec: str) -> BaseChatModel:
    return init_chat_model(spec, temperature=settings.llm_temperature)


@lru_cache
def get_model() -> BaseChatModel:
    """Primary model (Groq by default) with an optional fallback for rate limits."""
    model = _build(f"{settings.llm_provider}:{settings.llm_model}")
    if settings.llm_fallback_model:
        model = model.with_fallbacks([_build(settings.llm_fallback_model)])
    return model


async def structured(schema: type[BaseModel], system: str, human: str, model=None):
    """Call the model for a validated Pydantic object; retry once on parse/validation failure."""
    llm = (model or get_model()).with_structured_output(schema)
    messages = [("system", system), ("human", human)]
    try:
        return await llm.ainvoke(messages)
    except Exception:
        return await llm.ainvoke(messages)
