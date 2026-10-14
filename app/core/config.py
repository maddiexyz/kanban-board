import os
from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Real-Time Collaborative Kanban"
    API_V1_STR: str = "/api"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@127.0.0.1:5432/kanban_board"
    
    # Redis
    REDIS_URL: str = "redis://127.0.0.1:6379/0"
    
    ENVIRONMENT: str = "development"
    
    # JWT & Auth
    SECRET_KEY: str = "kanban-dev-secret-key-minimum-32-chars-long-2026-secure"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    REFRESH_COOKIE_NAME: str = "refresh_token"
    COOKIE_SECURE: bool = False  # Set to True in production HTTPS
    COOKIE_SAMESITE: str = "lax"

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str, info) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long.")
        env = info.data.get("ENVIRONMENT", "development")
        if env == "production":
            insecure_markers = ["change", "replace", "secret-jwt", "dev-secret", "example"]
            if any(marker in v.lower() for marker in insecure_markers):
                raise ValueError("Insecure default SECRET_KEY detected in production environment.")
        return v
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
