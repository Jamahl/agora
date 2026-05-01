from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.clients.openai_client import embed, embed_batch, structured
from app.config import get_settings
from app.logging_conf import log
from app.models import (
    Employee,
    Insight,
    InsightKeyResultTag,
    InsightOkrTag,
    Interview,
    InterviewSentiment,
    KeyResult,
    OKR,
)


class _Insight(BaseModel):
    type: str = Field(description="blocker|win|start_doing|stop_doing|tooling_gap|sentiment_note|other")
    content: str
    direct_quote: str | None = None
    severity: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0, le=1)


class _Extract(BaseModel):
    insights: list[_Insight]


class _Sentiment(BaseModel):
    morale: int = Field(ge=1, le=5)
    energy: int = Field(ge=1, le=5)
    candor: int = Field(ge=1, le=5)
    urgency: int = Field(ge=1, le=5)
    notes: str | None = None


class _Memory(BaseModel):
    summary: str


class _OkrMatch(BaseModel):
    okr_id: int
    relevant: bool
    confidence: float = Field(ge=0, le=1)
    reason: str | None = None


class _KeyResultMatch(BaseModel):
    key_result_id: int
    relevant: bool
    confidence: float = Field(ge=0, le=1)
    reason: str | None = None


class _OkrRelevance(BaseModel):
    okrs: list[_OkrMatch] = Field(default_factory=list)
    key_results: list[_KeyResultMatch] = Field(default_factory=list)


EXTRACT_SYSTEM = (
    "You extract operational intelligence from an employee interview transcript. "
    "Return a list of insights the employee actually expressed in THIS interview. "
    "Types: blocker (active obstacle), win (something working), start_doing (what we should start), "
    "stop_doing (what we should stop), tooling_gap (missing tools/info/access), "
    "sentiment_note (important mood or attitude signal), other. "
    "Each insight: 1-2 sentence paraphrase in third-person neutral voice; "
    "direct_quote is optional verbatim <= 200 chars; severity 1=trivial 5=business-critical; "
    "confidence reflects how clearly the employee stated it. "
    "Only extract claims from employee/user turns, not from the agent's questions, summaries, or prior-memory recaps. "
    "If the agent mentions something from a previous interview, include it only if the employee explicitly confirms, updates, denies, or expands on it in this interview. "
    "If the employee does not mention or confirm an old topic, omit it. "
    "DO NOT include anything flagged as sensitive-omitted. "
    "DO NOT invent signals the employee did not express."
)

SENTIMENT_SYSTEM = (
    "Rate an interview on morale, energy, candor, urgency — each 1-5. "
    "morale: how they feel about their work/company. "
    "energy: how energized they sounded. "
    "candor: how openly they spoke (1=guarded, 5=fully candid). "
    "urgency: how much pressure they seem under. "
    "notes: one short sentence of color."
)

MEMORY_SYSTEM = (
    "Summarize the last few interviews into a short briefing for the next call. "
    "Cover: open threads (what they were still wrestling with), prior wins, recurring frustrations. "
    "Max 120 words. No headers. Use second person ('you mentioned…') since the interviewer will read this."
)

OKR_RELEVANCE_SYSTEM = (
    "You decide whether employee interview insights are materially relevant to company OKRs and key results. "
    "Be strict. Tag only if the insight describes a blocker, risk, win, opportunity, behavior, or operational condition "
    "that directly affects progress toward the OKR or key result. "
    "Business wording may differ: for example, deal closure, due diligence, pipeline, review speed, or investment process "
    "can be relevant to acquisition or investment KRs if the connection is concrete. "
    "Do not tag generic morale, unrelated interpersonal issues, broad productivity notes, or old prior-memory topics unless "
    "the insight itself says the employee stated it in this interview. "
    "Return only candidate ids you were given. Reasons must be concise and specific."
)


def _transcript_text(interview: Interview) -> str:
    raw = interview.raw_transcript_json or {}
    call = raw.get("call") or {}
    transcript = call.get("transcript")
    if isinstance(transcript, str) and transcript:
        return transcript[:16000]
    obj = call.get("transcript_object") or call.get("transcript_with_tool_calls") or []
    if isinstance(obj, list):
        parts = []
        for seg in obj:
            role = seg.get("role") or seg.get("speaker") or "?"
            text = seg.get("content") or seg.get("text") or ""
            if text:
                parts.append(f"{role}: {text}")
        return "\n".join(parts)[:16000]
    return ""


def _cleaned(interview: Interview) -> dict:
    raw = interview.raw_transcript_json or {}
    call = raw.get("call") or {}
    obj = call.get("transcript_object") or call.get("transcript_with_tool_calls") or []
    segs = []
    if isinstance(obj, list):
        for seg in obj:
            if not isinstance(seg, dict):
                continue
            segs.append(
                {
                    "speaker": seg.get("role") or seg.get("speaker") or "?",
                    "ts": seg.get("words", [{}])[0].get("start") if seg.get("words") else None,
                    "text": (seg.get("content") or seg.get("text") or "").strip(),
                }
            )
    elif isinstance(call.get("transcript"), str):
        for line in (call["transcript"] or "").split("\n"):
            if not line.strip():
                continue
            if ":" in line:
                role, text = line.split(":", 1)
                segs.append({"speaker": role.strip(), "ts": None, "text": text.strip()})
            else:
                segs.append({"speaker": "?", "ts": None, "text": line.strip()})
    return {"segments": segs}


def _target_text(okr: OKR, kr: KeyResult | None = None) -> str:
    if not kr:
        return f"Objective: {okr.objective}"
    parts = [f"Objective: {okr.objective}", f"Key result: {kr.description}"]
    if kr.target_metric:
        parts.append(f"Target metric: {kr.target_metric}")
    if kr.current_value:
        parts.append(f"Current value: {kr.current_value}")
    return "\n".join(parts)


def _set_okr_tag(db: Session, insight_id: int, okr_id: int, similarity: float) -> None:
    existing = db.get(InsightOkrTag, (insight_id, okr_id))
    if existing:
        existing.similarity = float(similarity)
        return
    db.add(InsightOkrTag(insight_id=insight_id, okr_id=okr_id, similarity=float(similarity)))


def _set_kr_tag(
    db: Session,
    insight_id: int,
    key_result_id: int,
    similarity: float,
    match_reason: str,
) -> None:
    existing = db.get(InsightKeyResultTag, (insight_id, key_result_id))
    if existing:
        existing.similarity = float(similarity)
        existing.match_reason = match_reason[:500]
        return
    db.add(
        InsightKeyResultTag(
            insight_id=insight_id,
            key_result_id=key_result_id,
            similarity=float(similarity),
            match_reason=match_reason[:500],
        )
    )


def _tag_okrs_for_insights(db: Session, iv: Interview, insight_rows: list[Insight]) -> None:
    threshold = get_settings().okr_tag_threshold
    okrs = list(
        db.execute(select(OKR).where(OKR.company_id == iv.company_id, OKR.status == "active")).scalars()
    )
    okr_embs = [(o, o.embedding) for o in okrs if o.embedding is not None]
    kr_rows = list(
        db.execute(
            select(KeyResult, OKR)
            .join(OKR, OKR.id == KeyResult.okr_id)
            .where(OKR.company_id == iv.company_id, OKR.status == "active")
        ).all()
    )
    kr_threshold = max(threshold + 0.10, 0.65)
    kr_embs = [
        (kr, okr, kr.embedding)
        for kr, okr in kr_rows
        if kr.embedding is not None
    ]
    for row in insight_rows:
        if row.embedding is None or (not okr_embs and not kr_embs):
            continue
        okr_ranked = sorted(
            ((okr, _cos(row.embedding, emb)) for okr, emb in okr_embs),
            key=lambda x: x[1],
            reverse=True,
        )
        kr_ranked = sorted(
            ((kr, okr, _cos(row.embedding, emb)) for kr, okr, emb in kr_embs),
            key=lambda x: x[2],
            reverse=True,
        )
        okr_candidates = okr_ranked[:3]
        kr_candidates = kr_ranked[:4]
        if not okr_candidates and not kr_candidates:
            continue
        try:
            relevance = structured(
                [
                    {"role": "system", "content": OKR_RELEVANCE_SYSTEM},
                    {
                        "role": "user",
                        "content": (
                            "Insight:\n"
                            f"id: {row.id}\n"
                            f"type: {row.type}\n"
                            f"content: {row.content}\n"
                            f"direct_quote: {row.direct_quote or ''}\n\n"
                            "Candidate OKRs:\n"
                            + "\n\n".join(
                                f"okr_id: {okr.id}\nsimilarity: {sim:.3f}\n{_target_text(okr)}"
                                for okr, sim in okr_candidates
                            )
                            + "\n\nCandidate key results:\n"
                            + "\n\n".join(
                                f"key_result_id: {kr.id}\nsimilarity: {sim:.3f}\n{_target_text(okr, kr)}"
                                for kr, okr, sim in kr_candidates
                            )
                        ),
                    },
                ],
                _OkrRelevance,
                temperature=0.0,
                model=get_settings().openai_judge_model,
            )
        except Exception as exc:
            log.warning("okr_relevance_classifier_failed", insight_id=row.id, error=str(exc))
            for okr, sim in okr_ranked[:3]:
                if sim >= threshold:
                    _set_okr_tag(db, row.id, okr.id, sim)
            for kr, _okr, sim in kr_ranked[:2]:
                if sim >= kr_threshold:
                    _set_kr_tag(
                        db,
                        row.id,
                        kr.id,
                        sim,
                        f"Strong semantic match to KR: {kr.description[:160]}",
                    )
            continue
        okr_scores = {okr.id: sim for okr, sim in okr_candidates}
        kr_scores = {kr.id: sim for kr, _okr, sim in kr_candidates}
        tagged_okrs: set[int] = set()
        tagged_krs: set[int] = set()
        for match in relevance.okrs:
            if (
                match.relevant
                and match.confidence >= 0.7
                and match.okr_id in okr_scores
                and match.okr_id not in tagged_okrs
            ):
                tagged_okrs.add(match.okr_id)
                _set_okr_tag(db, row.id, match.okr_id, okr_scores[match.okr_id])
        for match in relevance.key_results:
            if (
                match.relevant
                and match.confidence >= 0.7
                and match.key_result_id in kr_scores
                and match.key_result_id not in tagged_krs
            ):
                tagged_krs.add(match.key_result_id)
                _set_kr_tag(
                    db,
                    row.id,
                    match.key_result_id,
                    kr_scores[match.key_result_id],
                    match.reason or "LLM-approved OKR relevance",
                )


def run_synthesis(db: Session, interview_id: int) -> None:
    iv = db.get(Interview, interview_id)
    if not iv:
        return
    log.info("synthesis_start", interview_id=iv.id)
    iv.cleaned_transcript_json = _cleaned(iv)
    db.commit()

    transcript = _transcript_text(iv)
    if not transcript.strip():
        log.warning("synthesis_no_transcript", interview_id=iv.id)
        return

    sensitive_note = ""
    if iv.sensitive_omitted:
        sensitive_note = (
            "The following topics were explicitly marked as sensitive-omitted and must NOT be "
            "turned into insights: " + "; ".join(iv.sensitive_omitted)
        )

    extract = structured(
        [
            {"role": "system", "content": EXTRACT_SYSTEM + ("\n\n" + sensitive_note if sensitive_note else "")},
            {"role": "user", "content": transcript},
        ],
        _Extract,
        temperature=0.0,
    )

    valid_types = {"blocker", "win", "start_doing", "stop_doing", "tooling_gap", "sentiment_note", "other"}
    kept: list[_Insight] = [i for i in extract.insights if i.type in valid_types and i.content.strip()]

    insight_rows: list[Insight] = []
    if kept:
        embeddings = embed_batch([i.content for i in kept])
        for i, emb in zip(kept, embeddings):
            row = Insight(
                interview_id=iv.id,
                employee_id=iv.employee_id,
                company_id=iv.company_id,
                type=i.type,
                content=i.content,
                direct_quote=i.direct_quote,
                severity=i.severity,
                confidence=i.confidence,
                embedding=emb,
                review_state="live",
            )
            db.add(row)
            insight_rows.append(row)
        db.flush()

    # Sentiment
    sent = structured(
        [
            {"role": "system", "content": SENTIMENT_SYSTEM},
            {"role": "user", "content": transcript},
        ],
        _Sentiment,
        temperature=0.0,
    )
    existing = db.get(InterviewSentiment, iv.id)
    if existing:
        existing.morale = sent.morale
        existing.energy = sent.energy
        existing.candor = sent.candor
        existing.urgency = sent.urgency
        existing.notes = sent.notes
    else:
        db.add(
            InterviewSentiment(
                interview_id=iv.id,
                morale=sent.morale,
                energy=sent.energy,
                candor=sent.candor,
                urgency=sent.urgency,
                notes=sent.notes,
            )
        )

    _tag_okrs_for_insights(db, iv, insight_rows)

    # Memory rollup
    recent = list(
        db.execute(
            select(Interview)
            .where(Interview.employee_id == iv.employee_id, Interview.status == "completed")
            .order_by(Interview.ended_at.desc())
            .limit(3)
        ).scalars()
    )
    bundle_lines: list[str] = []
    for past in recent:
        ins = list(
            db.execute(
                select(Insight).where(
                    Insight.interview_id == past.id, Insight.review_state == "live"
                )
            ).scalars()
        )
        if not ins:
            continue
        bundle_lines.append(f"Interview {past.ended_at.date() if past.ended_at else '?'}:")
        for i in ins[:8]:
            bundle_lines.append(f"- [{i.type}] {i.content}")
    if bundle_lines:
        mem = structured(
            [
                {"role": "system", "content": MEMORY_SYSTEM},
                {"role": "user", "content": "\n".join(bundle_lines)},
            ],
            _Memory,
            temperature=0.2,
        )
        emp = db.get(Employee, iv.employee_id)
        if emp:
            emp.memory_summary = mem.summary

    db.commit()
    log.info("synthesis_done", interview_id=iv.id, insights=len(insight_rows))

    # Progressive research report update
    if iv.research_request_id:
        from app.services.research_report import rebuild_report

        rebuild_report(db, iv.research_request_id)

    # Post-call summary email to the employee
    try:
        from app.services.summary_email import send_post_call_summary

        send_post_call_summary(db, iv.id)
    except Exception as e:
        log.warning("summary_email_failed", err=str(e), interview_id=iv.id)


def _cos(a: list[float], b: list[float]) -> float:
    import math

    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a))
    db_ = math.sqrt(sum(x * x for x in b))
    if da == 0 or db_ == 0:
        return 0.0
    return num / (da * db_)
