"""Tests for configuration loading."""

from src.common.config import AppSettings, Environment, load_settings


class TestConfig:
    def test_default_settings(self):
        settings = AppSettings()
        assert settings.env == Environment.LOCAL
        assert settings.debug is True
        assert settings.server.port == 8000

    def test_load_settings_local(self):
        settings = load_settings(Environment.LOCAL)
        assert settings.env == Environment.LOCAL
        assert settings.database.url.startswith("postgresql")

    def test_database_defaults(self):
        settings = AppSettings()
        assert settings.database.pool_size == 5
        assert settings.database.max_overflow == 10

    def test_auth_defaults(self):
        settings = AppSettings()
        assert settings.auth.access_token_expire_minutes == 60
        assert settings.auth.nonce_expire_minutes == 10
