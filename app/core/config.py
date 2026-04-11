from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Lumina API"
    VERSION: str = "1.0.0"

    # Database
    DATABASE_URL: str

    # Auth / JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CORS — comma-separated origins, or ["*"] for dev
    CORS_ORIGINS: str = "*"

    # AI/LLM configurations
    GEMINI_API_KEY: str
    EMBEDDING_MODEL_ID: str = "gemini-embedding-001"
    GENERATION_MODEL_ID: str = "gemini-2.5-flash"
    USE_LOCAL_LLM: bool = False
    LOCAL_MODEL_ID: str = "phi3"

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse CORS_ORIGINS into a list."""
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")

settings = Settings()

