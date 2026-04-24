from functools import lru_cache
from typing import Any, Type, TypeVar
from pydantic import BaseModel
from openai import OpenAI

from app.config import get_settings

T = TypeVar("T", bound=BaseModel)


@lru_cache
def client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


def embed(text: str) -> list[float]:
    s = get_settings()
    resp = client().embeddings.create(model=s.openai_embedding_model, input=text[:8000])
    return resp.data[0].embedding


def embed_batch(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    s = get_settings()
    resp = client().embeddings.create(
        model=s.openai_embedding_model, input=[t[:8000] for t in texts]
    )
    return [d.embedding for d in resp.data]


def chat(messages: list[dict[str, Any]], temperature: float = 0.2, model: str | None = None) -> str:
    s = get_settings()
    resp = client().chat.completions.create(
        model=model or s.openai_model,
        messages=messages,
        temperature=temperature,
    )
    return resp.choices[0].message.content or ""


def structured(
    messages: list[dict[str, Any]],
    schema: Type[T],
    temperature: float = 0.0,
    model: str | None = None,
) -> T:
    s = get_settings()
    resp = client().responses.parse(
        model=model or s.openai_model,
        input=messages,
        text_format=schema,
        temperature=temperature,
    )
    out = resp.output_parsed
    if out is None:
        raise RuntimeError("Structured parse returned no output")
    return out
