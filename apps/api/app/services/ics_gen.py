from __future__ import annotations

import base64
from datetime import datetime, timedelta
from ics import Calendar, Event

from app.models import Company, Employee, Interview


def build_ics(company: Company, employee: Employee, interview: Interview, link: str) -> tuple[str, str]:
    cal = Calendar()
    ev = Event()
    ev.name = f"Quick check-in with Agora"
    ev.begin = interview.scheduled_at
    ev.end = interview.scheduled_at + timedelta(minutes=20)
    ev.uid = f"agora-{interview.id}@agora.local"
    ev.description = (
        f"10–15 min voice chat with Agora — the AI colleague at {company.name}.\n"
        f"Click when the event starts: {link}"
    )
    ev.location = link
    ev.organizer = company.admin_email or "admin@agora.local"
    ev.attendees = {employee.email}
    cal.events.add(ev)
    ics_text = cal.serialize()
    ics_b64 = base64.b64encode(ics_text.encode("utf-8")).decode("ascii")
    return ics_text, ics_b64
