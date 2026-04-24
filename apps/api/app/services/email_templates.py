from __future__ import annotations

import re
from typing import Any

DEFAULTS: dict[str, dict[str, str]] = {
    "invite": {
        "subject": "Quick check-in with Agora — {{scheduled_at_short}}",
        "body_html": """<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0B0D10;">
  <p>Hi {{employee_first_name}},</p>
  <p>This is a 10–15 minute voice chat with Agora, the AI colleague at {{company_name}}. It helps leadership understand what's actually working and what's getting in the way.</p>
  <p><strong>When:</strong> {{scheduled_at_long}}</p>
  <p><a href="{{interview_link}}" style="display:inline-block;padding:10px 16px;background:#0B0D10;color:#fff;text-decoration:none;border-radius:6px;">Join the interview</a></p>
  <p style="color:#44505C;font-size:13px;">The .ics attachment adds it to your calendar.</p>
</div>""",
    },
    "reminder": {
        "subject": "Reminder — Agora interview in 15 min",
        "body_html": """<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0B0D10;">
  <p>Hi {{employee_first_name}}, your Agora check-in starts in about 15 minutes.</p>
  <p><a href="{{interview_link}}" style="display:inline-block;padding:10px 16px;background:#0B0D10;color:#fff;text-decoration:none;border-radius:6px;">Join</a></p>
</div>""",
    },
    "summary": {
        "subject": "Your Agora check-in — summary",
        "body_html": """<div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#0B0D10;">
  <p>Hi {{employee_first_name}},</p>
  <p>Thanks for talking with Agora. Here's a short recap so you've got it in writing.</p>
  <p><strong>What you shared:</strong></p>
  <div>{{summary_bullets_html}}</div>
  <p style="margin-top:16px;"><strong>What happens next:</strong></p>
  <div>{{next_steps_html}}</div>
  <p style="margin-top:24px;color:#44505C;font-size:13px;">Next check-in: {{next_checkin_label}}.</p>
</div>""",
    },
    "noshow_admin": {
        "subject": "{{employee_name}} missed two interviews",
        "body_html": """<p>{{employee_name}} has missed two consecutive interviews. Consider reaching out directly.</p>""",
    },
    "research_ready": {
        "subject": "Research report ready — {{question_short}}",
        "body_html": """<p>Your research on <strong>{{question}}</strong> is {{progress}} complete and ready to read.</p>
<p>Open the report in the dashboard.</p>""",
    },
}


_TOKEN_RE = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


def render(template: str, vars: dict[str, Any]) -> str:
    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        v = vars.get(key, "")
        return str(v if v is not None else "")

    return _TOKEN_RE.sub(repl, template or "")


def get_template(company_templates: dict[str, Any] | None, kind: str) -> dict[str, str]:
    """Return merged template (overrides on top of defaults)."""
    base = DEFAULTS.get(kind, {"subject": "", "body_html": ""})
    over = (company_templates or {}).get(kind) if isinstance(company_templates, dict) else None
    if isinstance(over, dict):
        return {
            "subject": over.get("subject") or base.get("subject", ""),
            "body_html": over.get("body_html") or base.get("body_html", ""),
        }
    return base


def all_kinds() -> list[str]:
    return list(DEFAULTS.keys())


def known_variables(kind: str) -> list[str]:
    """Advertise which variables each template accepts (for UI hints)."""
    common = ["employee_first_name", "employee_name", "company_name"]
    if kind in ("invite", "reminder", "summary"):
        common += ["interview_link", "scheduled_at_short", "scheduled_at_long"]
    if kind == "summary":
        common += ["summary_bullets_html", "next_steps_html", "next_checkin_label"]
    if kind == "noshow_admin":
        common += ["employee_name", "company_name"]
    if kind == "research_ready":
        common += ["question", "question_short", "progress"]
    return common
