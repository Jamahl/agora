#!/usr/bin/env python3
"""Pull a completed Retell call into the DB + run synthesis. For when a webhook was missed.

Usage (inside the api container):
    docker compose exec api python -c "
    import sys; sys.path.insert(0,'/app')
    exec(open('/scripts/recover_interview.py').read() if False else '')"
Simpler — just paste:

    docker compose exec api python /scripts/recover_interview.py <interview_id>
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone


def main(interview_id: int) -> int:
    sys.path.insert(0, "/app")
    from retell import Retell
    from app.db import SessionLocal
    from app.models import Interview
    from app.services.synthesis import run_synthesis

    rc = Retell(api_key=os.environ["RETELL_API_KEY"])
    with SessionLocal() as db:
        iv = db.get(Interview, interview_id)
        if not iv:
            print(f"no interview {interview_id}")
            return 1
        if not iv.retell_call_id:
            print(f"interview {interview_id} has no retell_call_id")
            return 1
        call = rc.call.retrieve(iv.retell_call_id)
        iv.ended_at = datetime.now(timezone.utc)
        iv.status = "completed"
        iv.raw_transcript_json = {
            "event": "call_ended",
            "call": call.model_dump() if hasattr(call, "model_dump") else dict(call),
        }
        iv.transcript_url = getattr(call, "transcript_url", None) or getattr(
            call, "public_log_url", None
        )
        iv.recording_url = getattr(call, "recording_url", None) or getattr(
            call, "public_recording_url", None
        )
        db.commit()
        print(f"interview {iv.id} pulled from Retell, running synthesis…")
        run_synthesis(db, iv.id)
        print("done")
        return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: recover_interview.py <interview_id>")
        sys.exit(1)
    sys.exit(main(int(sys.argv[1])))
