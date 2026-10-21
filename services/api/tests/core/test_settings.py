"""
tests/core/test_settings.py
──────────────────────────────
Unit tests for env parsing in app/core/settings.py and the extension-origin
check in main.py. No DB, no HTTP — pure function tests.
"""
from __future__ import annotations

import pytest

import main
from app.core.settings import Settings

SECRET = "test-secret-0123456789abcdef"
EXT = "chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh"


@pytest.fixture
def make_settings(monkeypatch):
    """Builds a fresh Settings from the given env vars only (no .env file)."""

    def _make(**env: str) -> Settings:
        for key in ("ALLOWED_ORIGINS", "EXTENSION_ORIGIN", "APP_ENV"):
            monkeypatch.delenv(key, raising=False)
        monkeypatch.setenv("JWT_SECRET_KEY", SECRET)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        return Settings(_env_file=None)

    return _make


class TestAllowedOrigins:
    def test_comma_separated_string_is_split_and_trimmed(self, make_settings):
        s = make_settings(ALLOWED_ORIGINS="http://localhost:3000, http://localhost:5173,")
        assert s.allowed_origins == ["http://localhost:3000", "http://localhost:5173"]

    def test_json_list_still_works(self, make_settings):
        s = make_settings(ALLOWED_ORIGINS='["https://app.example.com"]')
        assert s.allowed_origins == ["https://app.example.com"]

    def test_extension_origin_is_appended_once(self, make_settings):
        s = make_settings(ALLOWED_ORIGINS=f"https://app.example.com,{EXT}", EXTENSION_ORIGIN=EXT)
        assert s.allowed_origins == ["https://app.example.com", EXT]

    def test_no_extension_origin_by_default(self, make_settings):
        s = make_settings()
        assert s.extension_origin is None
        assert not any(o.startswith("chrome-extension://") for o in s.allowed_origins)


class TestExtensionOriginAllowed:
    def test_configured_origin_is_the_only_one_allowed(self, make_settings, monkeypatch):
        monkeypatch.setattr(main, "settings", make_settings(APP_ENV="production", EXTENSION_ORIGIN=EXT))
        assert main._extension_origin_allowed(EXT)
        assert not main._extension_origin_allowed("chrome-extension://someotherextensionid")

    def test_unset_allows_any_extension_in_development(self, make_settings, monkeypatch):
        monkeypatch.setattr(main, "settings", make_settings(APP_ENV="development"))
        assert main._extension_origin_allowed("chrome-extension://anything")

    @pytest.mark.parametrize("app_env", ["staging", "production"])
    def test_unset_allows_none_outside_development(self, make_settings, monkeypatch, app_env):
        monkeypatch.setattr(main, "settings", make_settings(APP_ENV=app_env))
        assert not main._extension_origin_allowed(EXT)
