"""Configuración de la aplicación leída desde variables de entorno o archivo .env.

Ninguna clave privada se escribe en el código: todas llegan por entorno.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Almacenamiento. Hoy solo existe "sqlite"; "firebase" queda reservado.
    storage_backend: str = "sqlite"
    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'horarios.db'}"

    # Orígenes permitidos para el frontend (separados por comas).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Generador
    solver_time_limit_seconds: float = 30.0
    solver_workers: int = 8

    # Reconocimiento de imágenes (opcional)
    openai_api_key: str | None = None
    openai_vision_model: str = "gpt-4.1"
    anthropic_api_key: str | None = None
    anthropic_vision_model: str = "claude-opus-5"
    max_upload_mb: int = 12

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
