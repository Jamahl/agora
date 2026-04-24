from functools import lru_cache
from typing import Any, Optional
from app.config import get_settings


def _resolve_versions(c: Any, toolkits: list[str]) -> dict[str, str]:
    versions: dict[str, str] = {}
    for slug in toolkits:
        try:
            tk = c.toolkits.get(slug)
            meta = getattr(tk, "meta", None)
            v = getattr(meta, "version", None) if meta else None
            if v:
                versions[slug] = v
        except Exception:
            pass
    return versions


@lru_cache
def client() -> Any:
    from composio import Composio

    api_key = _clean_key(get_settings().composio_api_key)
    # bootstrap a throwaway client to resolve latest toolkit versions
    bootstrap = Composio(api_key=api_key, toolkit_versions={})
    versions = _resolve_versions(bootstrap, ["notion", "gmail"])
    return Composio(api_key=api_key, toolkit_versions=versions or {})


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


def _extract_page_items(data: Any) -> list[dict]:
    """Unwrap Composio's NOTION_FETCH_DATA payload shape."""
    if not isinstance(data, dict):
        return []
    for key in ("results", "pages", "page_details", "items", "data"):
        val = data.get(key)
        if isinstance(val, list):
            return val
    nested = data.get("results_data") or data.get("response_data")
    if isinstance(nested, dict):
        return _extract_page_items(nested)
    return []


def _page_title(p: dict) -> str:
    for k in ("title", "name", "plain_text"):
        v = p.get(k)
        if isinstance(v, str) and v:
            return v
    props = p.get("properties") or {}
    if isinstance(props, dict):
        for prop in props.values():
            if isinstance(prop, dict) and prop.get("type") == "title":
                title_arr = prop.get("title") or []
                if title_arr and isinstance(title_arr, list):
                    return "".join(t.get("plain_text", "") for t in title_arr if isinstance(t, dict))
    return p.get("id") or ""


def _page_id(p: dict) -> str:
    for k in ("id", "page_id", "notion_id"):
        v = p.get(k)
        if isinstance(v, str) and v:
            return v
    return ""


def list_notion_pages(user_id: str) -> list[dict]:
    c = client()
    try:
        result = c.tools.execute(
            "NOTION_FETCH_DATA",
            user_id=user_id,
            arguments={"fetch_type": "pages", "page_size": 100},
        )
    except Exception as e:
        return [{"error": str(e)}]
    if not isinstance(result, dict) or not result.get("successful", result.get("successfull", True)):
        err = result.get("error") if isinstance(result, dict) else str(result)
        return [{"error": err or "unknown"}]
    raw = _extract_page_items(result.get("data") or result)
    cleaned: list[dict] = []
    for p in raw:
        if not isinstance(p, dict):
            continue
        pid = _page_id(p)
        if not pid:
            continue
        cleaned.append(
            {
                "id": pid,
                "title": _page_title(p) or "(untitled)",
                "last_edited_time": p.get("last_edited_time"),
                "parent_title": (p.get("parent") or {}).get("page_title")
                if isinstance(p.get("parent"), dict)
                else None,
            }
        )
    return cleaned


def fetch_notion_page_content(user_id: str, page_id: str) -> str:
    c = client()
    try:
        result = c.tools.execute(
            "NOTION_GET_PAGE_MARKDOWN",
            user_id=user_id,
            arguments={"page_id": page_id},
        )
    except Exception:
        return ""
    if not isinstance(result, dict):
        return ""
    data = result.get("data") or result
    if isinstance(data, dict):
        for key in ("markdown", "content", "plain_text", "text"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val
        nested = data.get("response_data") or data.get("data")
        if isinstance(nested, dict):
            for key in ("markdown", "content", "plain_text", "text"):
                val = nested.get(key)
                if isinstance(val, str) and val.strip():
                    return val
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
