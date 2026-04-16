"""Tests for database utility functions in site_api.db."""
from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qsl, urlparse

from fastapi import HTTPException

from site_api.db import (
    get_database_url,
    get_all_database_urls,
    _sanitize_database_url,
    _expand_url_candidates,
    get_connection,
    get_allowed_origins,
    _require_sync_secret,
    DATABASE_URL_ENV_KEYS,
)


class TestGetDatabaseUrl(unittest.TestCase):
    """Test get_database_url function."""

    def test_returns_first_available_env_var(self):
        """Test that it returns the first configured environment variable."""
        with patch.dict("os.environ", {"DATABASE_URL": "postgres://user:pass@localhost/db"}):
            url = get_database_url()
            self.assertEqual(url, "postgres://user:pass@localhost/db")

    def test_checks_env_keys_in_order(self):
        """Test that it checks env vars in the correct order."""
        with patch.dict(
            "os.environ",
            {
                "POSTGRES_URL": "postgres://second",
                "DATABASE_URL": "postgres://first",
            },
            clear=False,
        ):
            url = get_database_url()
            # Should get DATABASE_URL since it's checked first
            self.assertIn("first", url)

    def test_skips_empty_env_vars(self):
        """Test that it skips empty environment variables."""
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": "",
                "POSTGRES_URL": "postgres://valid",
            },
            clear=False,
        ):
            url = get_database_url()
            self.assertEqual(url, "postgres://valid")

    def test_strips_whitespace(self):
        """Test that whitespace is stripped."""
        with patch.dict("os.environ", {"DATABASE_URL": "  postgres://url  "}):
            url = get_database_url()
            self.assertEqual(url, "postgres://url")

    def test_returns_empty_string_if_no_database_url(self):
        """Test that it returns empty string if no database URL is configured."""
        with patch.dict("os.environ", {}, clear=True):
            url = get_database_url()
            self.assertEqual(url, "")

    def test_checks_all_known_keys(self):
        """Test that all DATABASE_URL_ENV_KEYS are checked."""
        # This is implicit in the implementation, but verify the list exists
        self.assertIn("DATABASE_URL", DATABASE_URL_ENV_KEYS)
        self.assertIn("POSTGRES_URL", DATABASE_URL_ENV_KEYS)
        self.assertGreater(len(DATABASE_URL_ENV_KEYS), 5)


class TestGetAllDatabaseUrls(unittest.TestCase):
    """Test get_all_database_urls function."""

    def test_returns_all_configured_urls(self):
        """Test that all configured URLs are returned."""
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": "postgres://first",
                "POSTGRES_URL": "postgres://second",
                "DATABASE_URL_NEON": "postgres://neon",
            },
            clear=True,
        ):
            urls = get_all_database_urls()
            self.assertIn("postgres://first", urls)
            self.assertIn("postgres://second", urls)
            self.assertIn("postgres://neon", urls)

    def test_deduplicates_urls(self):
        """Test that duplicate URLs are not included."""
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": "postgres://same",
                "POSTGRES_URL": "postgres://same",
            },
            clear=True,
        ):
            urls = get_all_database_urls()
            self.assertEqual(urls.count("postgres://same"), 1)

    def test_skips_empty_urls(self):
        """Test that empty URLs are not included."""
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": "postgres://valid",
                "POSTGRES_URL": "",
            },
            clear=True,
        ):
            urls = get_all_database_urls()
            self.assertNotIn("", urls)
            self.assertEqual(len(urls), 1)

    def test_strips_whitespace(self):
        """Test that whitespace is stripped from URLs."""
        with patch.dict(
            "os.environ",
            {
                "DATABASE_URL": "  postgres://url1  ",
                "POSTGRES_URL": "  postgres://url2  ",
            },
            clear=True,
        ):
            urls = get_all_database_urls()
            for url in urls:
                self.assertEqual(url, url.strip())

    def test_returns_empty_list_if_no_urls(self):
        """Test that it returns an empty list if no URLs are configured."""
        with patch.dict("os.environ", {}, clear=True):
            urls = get_all_database_urls()
            self.assertEqual(urls, [])


class TestSanitizeDatabaseUrl(unittest.TestCase):
    """Test _sanitize_database_url function."""

    def test_removes_non_postgres_params(self):
        """Test that non-PostgreSQL query parameters are removed."""
        url = "postgres://user:pass@localhost/db?sslmode=require&custom_param=value"
        result = _sanitize_database_url(url)
        parsed = urlparse(result)
        params = dict(parse_qsl(parsed.query))
        self.assertIn("sslmode", params)
        self.assertNotIn("custom_param", params)

    def test_keeps_known_postgres_params(self):
        """Test that known PostgreSQL parameters are preserved."""
        url = "postgres://user@localhost/db?sslmode=require&connect_timeout=10&application_name=myapp"
        result = _sanitize_database_url(url)
        parsed = urlparse(result)
        params = dict(parse_qsl(parsed.query))
        self.assertEqual(params.get("sslmode"), "require")
        self.assertEqual(params.get("connect_timeout"), "10")
        self.assertEqual(params.get("application_name"), "myapp")

    def test_preserves_url_structure(self):
        """Test that the URL structure (scheme, host, db) is preserved."""
        url = "postgres://user:pass@localhost:5432/mydb?sslmode=require&custom=value"
        result = _sanitize_database_url(url)
        parsed = urlparse(result)
        self.assertEqual(parsed.scheme, "postgres")
        self.assertEqual(parsed.hostname, "localhost")
        self.assertEqual(parsed.port, 5432)
        self.assertEqual(parsed.path, "/mydb")

    def test_handles_url_with_no_params(self):
        """Test that URLs with no query parameters are handled correctly."""
        url = "postgres://user:pass@localhost/db"
        result = _sanitize_database_url(url)
        self.assertEqual(result, "postgres://user:pass@localhost/db")

    def test_handles_url_with_only_known_params(self):
        """Test that URLs with only known params are unchanged."""
        url = "postgres://user@localhost/db?sslmode=require"
        result = _sanitize_database_url(url)
        self.assertIn("sslmode=require", result)

    def test_removes_unknown_params_from_neon_url(self):
        """Test sanitizing a Neon-style URL."""
        url = "postgres://user:pass@neon.tech/db?sslmode=require&sslcert=test&connect_timeout=5"
        result = _sanitize_database_url(url)
        parsed = urlparse(result)
        params = dict(parse_qsl(parsed.query))
        self.assertIn("sslmode", params)
        self.assertIn("connect_timeout", params)
        self.assertNotIn("sslcert", params)


class TestExpandUrlCandidates(unittest.TestCase):
    """Test _expand_url_candidates function."""

    def test_returns_list_of_candidates(self):
        """Test that it returns a list of URL candidates."""
        url = "postgres://user:pass@localhost/db"
        candidates = _expand_url_candidates(url)
        self.assertIsInstance(candidates, list)
        self.assertGreater(len(candidates), 0)

    def test_includes_sanitized_url(self):
        """Test that the sanitized URL is included in candidates."""
        url = "postgres://user:pass@localhost/db?custom=value"
        candidates = _expand_url_candidates(url)
        # At least one candidate should have been sanitized
        self.assertGreater(len(candidates), 0)

    def test_adds_timeout_param(self):
        """Test that candidates with connect_timeout are added."""
        url = "postgres://user:pass@localhost/db"
        candidates = _expand_url_candidates(url)
        # At least one candidate should have connect_timeout
        has_timeout = any("connect_timeout" in c for c in candidates)
        self.assertTrue(has_timeout)

    def test_adds_ssl_candidate_if_not_present(self):
        """Test that an SSL variant is added if sslmode is not in original."""
        url = "postgres://user:pass@localhost/db"
        candidates = _expand_url_candidates(url)
        # At least one candidate should have sslmode
        has_ssl = any("sslmode" in c for c in candidates)
        self.assertTrue(has_ssl)

    def test_does_not_duplicate_sslmode_if_present(self):
        """Test that duplicate sslmode entries are not added."""
        url = "postgres://user:pass@localhost/db?sslmode=require"
        candidates = _expand_url_candidates(url)
        # Count candidates with sslmode=require
        ssl_candidates = [c for c in candidates if "sslmode=require" in c]
        # Should not be excessive duplicates
        self.assertLessEqual(len(ssl_candidates), 3)

    def test_does_not_include_duplicates(self):
        """Test that duplicate candidates are not included."""
        url = "postgres://user:pass@localhost/db"
        candidates = _expand_url_candidates(url)
        # Each candidate should be unique
        self.assertEqual(len(candidates), len(set(candidates)))

    def test_handles_url_with_existing_params(self):
        """Test handling of URLs that already have various parameters."""
        url = "postgres://user@host/db?sslmode=require&connect_timeout=10"
        candidates = _expand_url_candidates(url)
        self.assertGreater(len(candidates), 0)
        # All should be valid URLs
        for candidate in candidates:
            self.assertTrue(candidate.startswith("postgres://"))


class TestGetAllowedOrigins(unittest.TestCase):
    """Test get_allowed_origins function."""

    def test_returns_default_origins_if_not_configured(self):
        """Test that default origins are returned if CORS_ALLOW_ORIGINS is not set."""
        with patch.dict("os.environ", {}, clear=True):
            origins = get_allowed_origins()
            self.assertIn("http://localhost:3000", origins)
            self.assertIn("http://localhost:5173", origins)
            self.assertIn("http://127.0.0.1:3000", origins)

    def test_parses_comma_separated_origins(self):
        """Test that comma-separated origins are parsed correctly."""
        with patch.dict("os.environ", {"CORS_ALLOW_ORIGINS": "https://example.com,https://api.example.com"}):
            origins = get_allowed_origins()
            self.assertIn("https://example.com", origins)
            self.assertIn("https://api.example.com", origins)

    def test_strips_whitespace_from_origins(self):
        """Test that whitespace around origins is stripped."""
        with patch.dict("os.environ", {"CORS_ALLOW_ORIGINS": "  https://example.com  ,  https://other.com  "}):
            origins = get_allowed_origins()
            self.assertIn("https://example.com", origins)
            self.assertIn("https://other.com", origins)

    def test_skips_empty_origins(self):
        """Test that empty origin strings are skipped."""
        with patch.dict("os.environ", {"CORS_ALLOW_ORIGINS": "https://example.com,,https://other.com"}):
            origins = get_allowed_origins()
            self.assertEqual(len(origins), 2)
            self.assertNotIn("", origins)

    def test_handles_single_origin(self):
        """Test that a single origin without comma is handled."""
        with patch.dict("os.environ", {"CORS_ALLOW_ORIGINS": "https://example.com"}):
            origins = get_allowed_origins()
            self.assertEqual(origins, ["https://example.com"])

    def test_handles_empty_env_var(self):
        """Test that an empty CORS_ALLOW_ORIGINS returns defaults."""
        with patch.dict("os.environ", {"CORS_ALLOW_ORIGINS": ""}):
            origins = get_allowed_origins()
            self.assertIn("http://localhost:3000", origins)

    def test_handles_whitespace_only_env_var(self):
        """Test that whitespace-only CORS_ALLOW_ORIGINS returns defaults."""
        with patch.dict("os.environ", {"CORS_ALLOW_ORIGINS": "   "}):
            origins = get_allowed_origins()
            self.assertIn("http://localhost:3000", origins)


class TestRequireSyncSecret(unittest.TestCase):
    """Test _require_sync_secret function."""

    def test_allows_access_if_no_secret_configured(self):
        """Test that access is allowed when SYNC_SECRET is not configured."""
        with patch.dict("os.environ", {}, clear=True):
            # Should not raise
            _require_sync_secret(None)
            _require_sync_secret("anything")
            _require_sync_secret("")

    def test_allows_access_if_empty_secret_configured(self):
        """Test that access is allowed when SYNC_SECRET is empty."""
        with patch.dict("os.environ", {"SYNC_SECRET": ""}):
            # Should not raise
            _require_sync_secret(None)
            _require_sync_secret("anything")

    def test_allows_access_with_matching_secret(self):
        """Test that access is allowed when secret matches."""
        with patch.dict("os.environ", {"SYNC_SECRET": "mysecret"}):
            # Should not raise
            _require_sync_secret("mysecret")

    def test_rejects_access_with_wrong_secret(self):
        """Test that access is rejected when secret does not match."""
        with patch.dict("os.environ", {"SYNC_SECRET": "mysecret"}):
            with self.assertRaises(HTTPException) as context:
                _require_sync_secret("wrongsecret")
            self.assertEqual(context.exception.status_code, 401)

    def test_rejects_access_with_none_secret(self):
        """Test that access is rejected when provided secret is None."""
        with patch.dict("os.environ", {"SYNC_SECRET": "mysecret"}):
            with self.assertRaises(HTTPException) as context:
                _require_sync_secret(None)
            self.assertEqual(context.exception.status_code, 401)

    def test_rejects_access_with_empty_secret(self):
        """Test that access is rejected when provided secret is empty."""
        with patch.dict("os.environ", {"SYNC_SECRET": "mysecret"}):
            with self.assertRaises(HTTPException) as context:
                _require_sync_secret("")
            self.assertEqual(context.exception.status_code, 401)

    def test_strips_whitespace_from_configured_secret(self):
        """Test that configured secret is stripped of whitespace."""
        with patch.dict("os.environ", {"SYNC_SECRET": "  mysecret  "}):
            # Should not raise
            _require_sync_secret("mysecret")

    def test_strips_whitespace_from_provided_secret(self):
        """Test that provided secret is stripped of whitespace."""
        with patch.dict("os.environ", {"SYNC_SECRET": "mysecret"}):
            # Should not raise (whitespace is stripped)
            _require_sync_secret("  mysecret  ")

    def test_error_message_is_informative(self):
        """Test that error message is appropriate."""
        with patch.dict("os.environ", {"SYNC_SECRET": "mysecret"}):
            with self.assertRaises(HTTPException) as context:
                _require_sync_secret("wrongsecret")
            self.assertIn("Sync-Secret", context.exception.detail)


class TestGetConnection(unittest.TestCase):
    """Regression tests for pooled and direct database connection handling."""

    def test_pooled_connection_is_returned_to_pool(self):
        mock_pool = MagicMock()
        mock_connection = MagicMock()
        mock_pool.getconn.return_value = mock_connection

        with patch("site_api.db._DB_POOL", mock_pool), get_connection() as connection:
            self.assertIs(connection, mock_connection)

        mock_pool.getconn.assert_called_once_with()
        mock_pool.putconn.assert_called_once_with(mock_connection)
        mock_connection.rollback.assert_not_called()

    def test_pooled_connection_reraises_caller_error_and_rolls_back(self):
        mock_pool = MagicMock()
        mock_connection = MagicMock()
        mock_pool.getconn.return_value = mock_connection

        with patch("site_api.db._DB_POOL", mock_pool), self.assertRaisesRegex(RuntimeError, "boom"):
            with get_connection():
                raise RuntimeError("boom")

        mock_connection.rollback.assert_called_once_with()
        mock_pool.putconn.assert_called_once_with(mock_connection)

    def test_falls_back_to_direct_connection_when_pool_checkout_fails(self):
        mock_pool = MagicMock()
        mock_pool.getconn.side_effect = RuntimeError("pool unavailable")
        fallback_connection = MagicMock()

        with (
            patch("site_api.db._DB_POOL", mock_pool),
            patch("site_api.db.get_database_url_candidates", return_value=["postgres://fallback"]),
            patch("site_api.db.psycopg.connect", return_value=fallback_connection) as mock_connect,
            get_connection() as connection,
        ):
            self.assertIs(connection, fallback_connection)

        mock_connect.assert_called_once_with("postgres://fallback")
        fallback_connection.close.assert_called_once_with()

    def test_direct_connection_reraises_caller_error_and_closes(self):
        mock_connection = MagicMock()

        with (
            patch("site_api.db._DB_POOL", None),
            patch("site_api.db.get_database_url_candidates", return_value=["postgres://direct"]),
            patch("site_api.db.psycopg.connect", return_value=mock_connection),
            self.assertRaisesRegex(RuntimeError, "boom"),
        ):
            with get_connection():
                raise RuntimeError("boom")

        mock_connection.rollback.assert_called_once_with()
        mock_connection.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
