import httpx
from app.config import get_settings

LOOPS_API = "https://app.loops.so/api/v1"


def send_transactional(
    email: str,
    transactional_id: str,
    data_variables: dict | None = None,
    attachments: list[dict] | None = None,
) -> dict:
    key = get_settings().loops_api_key
    if not key:
        return {"skipped": True, "reason": "no_loops_api_key"}
    payload: dict = {
        "email": email,
        "transactionalId": transactional_id,
        "dataVariables": data_variables or {},
    }
    if attachments:
        payload["attachments"] = attachments
    r = httpx.post(
        f"{LOOPS_API}/transactional",
        json=payload,
        headers={"Authorization": f"Bearer {key}"},
        timeout=15.0,
    )
    return {"status_code": r.status_code, "body": r.json() if r.content else None}


def upsert_contact(email: str, properties: dict | None = None) -> dict:
    key = get_settings().loops_api_key
    if not key:
        return {"skipped": True}
    r = httpx.post(
        f"{LOOPS_API}/contacts/update",
        json={"email": email, **(properties or {})},
        headers={"Authorization": f"Bearer {key}"},
        timeout=15.0,
    )
    return {"status_code": r.status_code, "body": r.json() if r.content else None}
