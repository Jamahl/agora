from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(..., alias="DATABASE_URL")
    admin_cookie_secret: str = Field(..., alias="ADMIN_COOKIE_SECRET")

    openai_api_key: str = Field(..., alias="OPENAI_API_KEY")
    openai_model: str = Field("gpt-4.1", alias="OPENAI_MODEL")
    openai_embedding_model: str = Field("text-embedding-3-large", alias="OPENAI_EMBEDDING_MODEL")
    embedding_dim: int = Field(3072, alias="OPENAI_EMBEDDING_DIM")

    retell_api_key: str = Field(..., alias="RETELL_API_KEY")
    retell_agent_id: str = Field("", alias="RETELL_AGENT_ID")
    retell_webhook_base_url: str = Field("http://localhost:8000", alias="RETELL_WEBHOOK_BASE_URL")

    composio_api_key: str = Field("", alias="COMPOSIO_API_KEY")
    loops_api_key: str = Field("", alias="LOOPS_API_KEY")

    prompts_dir: str = Field("/prompts", alias="PROMPTS_DIR")

    okr_tag_threshold: float = Field(0.55, alias="OKR_TAG_THRESHOLD")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
