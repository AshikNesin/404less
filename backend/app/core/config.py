from __future__ import annotations

import os
from functools import lru_cache
from importlib import metadata

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LoggingConfig(BaseModel):
    level: str = "INFO"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../infra/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    env: str = Field(default="development", alias="ENV")
    database_url: str = Field(
        default="postgresql+psycopg://dev:dev@localhost:5432/app",
        alias="DATABASE_URL",
    )
    backend_host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
    backend_port: int = Field(default=9001, alias="BACKEND_PORT")
    cors_origins_raw: str | None = Field(default=None, alias="CORS_ORIGINS")
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    version_override: str | None = Field(default=None, alias="BACKEND_VERSION")
    commit_ref: str | None = Field(default=None, alias="COMMIT_REF")
    
    # Production settings
    secret_key: str = Field(default="dev-secret-key-change-in-production", alias="SECRET_KEY")
    debug: bool = Field(default=False, alias="DEBUG")
    
    # Database settings
    db_pool_size: int = Field(default=5, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    db_pool_timeout: int = Field(default=30, alias="DB_POOL_TIMEOUT")
    db_pool_recycle: int = Field(default=3600, alias="DB_POOL_RECYCLE")

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._validate_settings()

    def _validate_settings(self) -> None:
        """Validate settings for production safety."""
        if self.env == "production":
            if self.secret_key == "dev-secret-key-change-in-production":
                raise ValueError(
                    "SECRET_KEY must be set to a secure value in production"
                )
            if self.debug:
                raise ValueError("DEBUG must be False in production")
            if not self.cors_origins_raw:
                raise ValueError("CORS_ORIGINS must be explicitly set in production")
            
            # Check for development defaults in database URL
            if "dev:dev@localhost" in self.database_url:
                raise ValueError(
                    "Database URL appears to use development credentials in production"
                )

    @property
    def cors_origins(self) -> list[str]:
        if not self.cors_origins_raw:
            if self.env == "production":
                raise ValueError("CORS_ORIGINS must be explicitly set in production")
            return ["http://localhost:9000"]
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def is_development(self) -> bool:
        return self.env.lower() == "development"

    @property
    def version(self) -> str:
        if self.version_override:
            return self.version_override
        try:
            return metadata.version("tiny-backend")
        except metadata.PackageNotFoundError:
            return "0.1.0"

    @property
    def commit(self) -> str:
        return self.commit_ref or os.getenv("GIT_COMMIT", "unknown")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[arg-type]


settings = get_settings()
