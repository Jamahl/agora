from functools import lru_cache
from typing import Any, Optional
from app.config import get_settings


@lru_cache
def client() -> Any:
    from composio import Composio

    return Composio(api_key=_clean_key(get_settings().composio_api_key))


def _clean_key(k: str) -> str:
    # env file had accidental double prefix "COMPOSIO_API_KEY=ak_..."
    if "=" in k:
        return k.split("=", 1)[1]
    return k


def _authorize(user_id: str, toolkit: str) -> dict:
    c = client()
    try:
        req = c.toolkits.authorize(user_id=user_id, toolkit=toolkit)
        return {
            "redirect_url": getattr(req, "redirect_url", None),
            "connection_id": getattr(req, "id", None),
        }
    except Exception as e:
        return {"error": str(e)}


def initiate_notion_connection(user_id: str, redirect_url: Optional[str] = None) -> dict:
    return _authorize(user_id, "notion")


def initiate_gmail_connection(user_id: str) -> dict:
    return _authorize(user_id, "gmail")


def check_connection(user_id: str, toolkit: str) -> bool:
    c = client()
    try:
        accounts = c.connected_accounts.list(user_ids=[user_id])
        items = getattr(accounts, "items", None) or []
        for acct in items:
            tk = (getattr(acct, "toolkit", None) or {})
            slug = getattr(tk, "slug", None) if not isinstance(tk, dict) else tk.get("slug")
            status = getattr(acct, "status", None)
            if (slug or "").lower() == toolkit.lower() and status == "ACTIVE":
                return True
    except Exception:
        pass
    return False


def list_notion_pages(user_id: str) -> list[dict]:
    c = client()
    try:
        result = c.tools.execute(
            "NOTION_SEARCH_NOTION_PAGE",
            user_id=user_id,
            arguments={"query": ""},
        )
        data = result.get("data", {}) if isinstance(result, dict) else {}
        return data.get("results", data.get("pages", [])) or []
    except Exception:
        return []


def fetch_notion_page_content(user_id: str, page_id: str) -> str:
    c = client()
    try:
        result = c.tools.execute(
            "NOTION_FETCH_DATA",
            user_id=user_id,
            arguments={"page_id": page_id},
        )
        data = result.get("data") if isinstance(result, dict) else None
        if isinstance(data, dict):
            return str(data.get("content") or data.get("plain_text") or "")
        return str(data or "")
    except Exception:
        return ""


def send_gmail(
    user_id: str,
    recipient: str,
    subject: str,
    body_html: str,
    attachments_b64: list[dict] | None = None,
) -> dict:
    """Send an email from the admin's connected Gmail. attachments_b64 is a list of
    {filename, mime_type, data_base64}."""
    c = client()
    args: dict = {
        "recipient_email": recipient,
        "subject": subject,
        "body": body_html,
        "is_html": True,
    }
    if attachments_b64:
        args["attachment"] = attachments_b64[0]
    try:
        result = c.tools.execute(
            "GMAIL_SEND_EMAIL",
            user_id=user_id,
            arguments=args,
        )
        return result if isinstance(result, dict) else {"result": str(result)}
    except Exception as e:
        return {"error": str(e)}
