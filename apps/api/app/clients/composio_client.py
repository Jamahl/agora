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


def initiate_notion_connection(user_id: str, redirect_url: Optional[str] = None) -> dict:
    c = client()
    try:
        req = c.toolkits.authorize(user_id=user_id, toolkit="notion")
        return {"redirect_url": getattr(req, "redirect_url", None), "connection_id": getattr(req, "id", None)}
    except Exception as e:
        return {"error": str(e)}


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
