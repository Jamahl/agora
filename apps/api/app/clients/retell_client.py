from functools import lru_cache
from retell import Retell

from app.config import get_settings


@lru_cache
def client() -> Retell:
    return Retell(api_key=get_settings().retell_api_key)
