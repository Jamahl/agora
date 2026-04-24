from __future__ import annotations

import json
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AdminAlert, Insight, Interview

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify(body: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    try:
        from retell.lib.webhook_auth import verify

        return verify(body.decode("utf-8"), get_settings().retell_api_key, signature)
    except Exception:
        return False


@router.post("/retell")
async def retell_webhook(
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    from app.logging_conf import log as _log

    body = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    sig = headers.get("x-retell-signature")
    verified = _verify(body, sig)
    if not verified:
        _log.warning(
            "retell_webhook_unverified",
            has_sig=bool(sig),
            sig_prefix=(sig[:20] if sig else None),
            header_keys=list(headers.keys()),
            body_len=len(body),
        )
        import os

        if os.environ.get("VERIFY_RETELL_WEBHOOK", "true").lower() != "false":
            raise HTTPException(401, "Invalid signature")
    payload = json.loads(body or b"{}")
    event = payload.get("event")
    call = payload.get("call") or {}
    call_id = call.get("call_id")
    if not call_id:
        return {"ok": True}

    iv = db.execute(select(Interview).where(Interview.retell_call_id == call_id)).scalar_one_or_none()
    if not iv:
        return {"ok": True, "note": "no interview for call_id"}

    if event == "call_started":
        iv.started_at = datetime.now(timezone.utc)
        iv.status = "in_progress"
        db.commit()
    elif event == "call_ended" or event == "call_analyzed":
        iv.ended_at = datetime.now(timezone.utc)
        iv.status = "completed"
        iv.raw_transcript_json = payload
        iv.transcript_url = call.get("transcript_url") or call.get("public_log_url")
        iv.recording_url = call.get("recording_url") or call.get("public_recording_url")
        db.commit()
        bg.add_task(_run_synthesis, iv.id)

    return {"ok": True}


def _run_synthesis(interview_id: int) -> None:
    from app.db import SessionLocal
    from app.services.synthesis import run_synthesis

    with SessionLocal() as db:
        run_synthesis(db, interview_id)


@router.post("/retell/functions/{name}")
async def retell_function(
    name: str,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    payload = await request.json()
    call_id = (payload.get("call") or {}).get("call_id") or payload.get("call_id")
    args = payload.get("args") or payload.get("arguments") or {}
    iv = db.execute(select(Interview).where(Interview.retell_call_id == call_id)).scalar_one_or_none()
    if not iv:
        return {"ok": False, "error": "no interview"}

    if name == "mark_sensitive_omit":
        label = str(args.get("label") or "")
        iv.sensitive_omitted = [*(iv.sensitive_omitted or []), label]
        db.commit()
        return {"ok": True}

    if name == "mark_sensitive_flag_for_review":
        paraphrase = str(args.get("paraphrase") or "")
        if paraphrase:
            db.add(
                Insight(
                    interview_id=iv.id,
                    employee_id=iv.employee_id,
                    company_id=iv.company_id,
                    type="other",
                    content=paraphrase,
                    review_state="needs_review",
                    severity=3,
                    confidence=0.6,
                )
            )
            db.commit()
        return {"ok": True}

    if name == "trigger_admin_alert":
        category = str(args.get("category") or "other")
        summary = str(args.get("summary") or "")
        db.add(
            AdminAlert(
                company_id=iv.company_id,
                category=category,
                summary=summary,
                interview_id=iv.id,
            )
        )
        db.commit()
        return {"ok": True}

    if name == "correct_summary":
        iv.corrected_summary = str(args.get("updated_summary") or "")
        db.commit()
        return {"ok": True}

    if name == "end_call":
        return {"ok": True}

    return {"ok": False, "error": f"unknown function {name}"}
