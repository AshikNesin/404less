from __future__ import annotations

import os
from functools import lru_cache
from importlib import metadata

from pydantic import BaseModel, Field, validator
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

    # Environment
    env: str = Field(default="development", alias="ENV")

    # Database - REQUIRED field with no hardcoded default
    database_url: str = Field(alias="DATABASE_URL")

    # Application Settings
    backend_host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
    backend_port: int = Field(default=9001, alias="BACKEND_PORT")
    cors_origins_raw: str | None = Field(default=None, alias="CORS_ORIGINS")
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    version_override: str | None = Field(default=None, alias="BACKEND_VERSION")
    commit_ref: str | None = Field(default=None, alias="COMMIT_REF")

    # Security - REQUIRED field with no hardcoded default
    secret_key: str = Field(alias="SECRET_KEY")
    debug: bool = Field(default=False, alias="DEBUG")

    # Database Pool Settings
    db_pool_size: int = Field(default=5, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=10, alias="DB_MAX_OVERFLOW")
    db_pool_timeout: int = Field(default=30, alias="DB_POOL_TIMEOUT")
    db_pool_recycle: int = Field(default=3600, alias="DB_POOL_RECYCLE")

    @validator("database_url")
    def validate_database_url(cls, v: str) -> str:
        """Validate that database_url is provided."""
        if not v or v.strip() == "":
            raise ValueError("DATABASE_URL is required and cannot be empty")
        return v.strip()

    @validator("secret_key")
    def validate_secret_key(cls, v: str) -> str:
        """Validate that secret_key is provided and secure."""
        if not v or v.strip() == "":
            raise ValueError("SECRET_KEY is required and cannot be empty")
        if v.strip().lower() == "dev-secret-key-change-in-production":
            raise ValueError(
                "SECRET_KEY must be changed from the default development value"
            )
        return v.strip()

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._validate_settings()

    def _validate_settings(self) -> None:
        """Validate settings for production safety."""
        if self.env == "production":
            if self.debug:
                raise ValueError("DEBUG must be False in production")
            if not self.cors_origins_raw:
                raise ValueError("CORS_ORIGINS must be explicitly set in production")

            # Check for development patterns in production settings
            if "dev:dev@localhost" in self.database_url:
                raise ValueError(
                    "Database URL appears to use development credentials in production"
                )
            if "localhost" in self.database_url:
                raise ValueError(
                    "Database URL should not use localhost in production"
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
    return Settings()


settings = get_settings()
