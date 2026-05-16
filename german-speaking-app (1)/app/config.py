from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    """
    App settings loaded from environment variables or .env file.
    Copy .env.example → .env and fill in your Groq API key.
    """

    # Groq
    groq_api_key: str
    groq_model: str = "llama-3.3-70b-versatile"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
