from __future__ import annotations

import os
from enum import StrEnum
from pathlib import Path
from typing import Any

try:
    import rtoml as toml_lib

    def _load_toml(path: Path) -> dict[str, Any]:
        with open(path, encoding="utf-8") as f:
            return toml_lib.load(f)

except ImportError:
    import tomllib

    def _load_toml(path: Path) -> dict[str, Any]:
        with open(path, "rb") as f:
            return tomllib.load(f)


from pydantic import BaseModel
from pydantic_settings import BaseSettings


class Environment(StrEnum):
    LOCAL = "local"
    DEV = "dev"
    PROD = "prod"
    TEST = "test"


class DatabaseSettings(BaseModel):
    url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/lenclaw_db"
    echo: bool = False
    pool_size: int = 5
    max_overflow: int = 10


class AuthSettings(BaseModel):
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    nonce_expire_minutes: int = 10


class Web3Settings(BaseModel):
    rpc_url: str = "https://mainnet.base.org"
    chain_id: int = 8453


class ServerSettings(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8000


class CorsSettings(BaseModel):
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]


class AppSettings(BaseSettings):
    model_config = {"extra": "ignore"}

    name: str = "lenclaw"
    env: Environment = Environment.LOCAL
    debug: bool = True
    server: ServerSettings = ServerSettings()
    database: DatabaseSettings = DatabaseSettings()
    auth: AuthSettings = AuthSettings()
    web3: Web3Settings = Web3Settings()
    cors: CorsSettings = CorsSettings()


BASE_DIR = Path(__file__).resolve().parents[2]
CONFIG_DIR = BASE_DIR / "config"


def get_current_env() -> Environment:
    raw = os.getenv("APP_ENV", "local")
    return Environment(raw)


def load_settings(env: Environment | None = None) -> AppSettings:
    if env is None:
        env = get_current_env()

    config_path = CONFIG_DIR / env / "config.toml"
    if config_path.is_file():
        raw = _load_toml(config_path)
        app_block = raw.pop("app", {})
        flat: dict[str, Any] = {**app_block, **raw}
        return AppSettings.model_validate(flat)

    return AppSettings(env=env)
