from __future__ import annotations

from pydantic import BaseModel
from app.clients.openai_client import structured
from app.schemas import OKRExtractOut, OKRIn, KeyResultIn


class _KR(BaseModel):
    description: str
    target_metric: str | None = None


class _Obj(BaseModel):
    objective: str
    key_results: list[_KR]


class _Parsed(BaseModel):
    objectives: list[_Obj]


SYSTEM = (
    "You parse OKR documents into structured form. "
    "Return only OKRs explicitly stated in the input. "
    "Do not invent, infer, or editorialize. "
    "An OKR has one objective and 1-5 key results. "
    "If the input is clearly not an OKR doc, return an empty list."
)


def extract_okrs(text: str) -> OKRExtractOut:
    if not text.strip():
        return OKRExtractOut(objectives=[])
    parsed = structured(
        [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": text[:12000]},
        ],
        _Parsed,
        temperature=0.0,
    )
    return OKRExtractOut(
        objectives=[
            OKRIn(
                objective=o.objective,
                key_results=[
                    KeyResultIn(description=k.description, target_metric=k.target_metric)
                    for k in o.key_results
                ],
            )
            for o in parsed.objectives
        ]
    )
