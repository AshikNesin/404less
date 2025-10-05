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

    @property
    def cors_origins(self) -> list[str]:
        if not self.cors_origins_raw:
            return ["http://localhost:9000"]
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

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
