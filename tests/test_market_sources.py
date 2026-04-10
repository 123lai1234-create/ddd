"""
Tests for site_api.market_sources — market data parsing utilities.
"""

from site_api.market_sources import (
    _parse_float,
    _parse_int,
    _roc_date_to_iso,
    is_twse_symbol,
    _normalize_taifex_header,
)


class TestParseFloat:
    def test_normal_float(self):
        assert _parse_float("123.45") == 123.45

    def test_with_commas(self):
        assert _parse_float("1,234.56") == 1234.56

    def test_none_value(self):
        assert _parse_float(None) is None

    def test_dash_values(self):
        assert _parse_float("--") is None
        assert _parse_float("---") is None
        assert _parse_float("N/A") is None

    def test_unicode_symbols(self):
        # Full-width plus/minus signs
        result = _parse_float("＋100")
        assert result == 100.0

    def test_triangle_symbols(self):
        assert _parse_float("▽50") == -50.0
        assert _parse_float("△50") == 50.0


class TestParseInt:
    def test_normal_int(self):
        assert _parse_int("42") == 42

    def test_float_truncated(self):
        assert _parse_int("99.7") == 99

    def test_none_value(self):
        assert _parse_int(None) is None


class TestRocDateToIso:
    def test_valid_roc_date(self):
        assert _roc_date_to_iso("113/01/15") == "2024-01-15"

    def test_empty_string(self):
        assert _roc_date_to_iso("") is None

    def test_invalid_format(self):
        assert _roc_date_to_iso("2024-01-15") is None


class TestIsTwseSymbol:
    def test_four_digit(self):
        assert is_twse_symbol("2330") is True

    def test_six_digit(self):
        assert is_twse_symbol("006208") is True

    def test_non_numeric(self):
        assert is_twse_symbol("AAPL") is False

    def test_too_short(self):
        assert is_twse_symbol("12") is False


class TestNormalizeTaifexHeader:
    def test_removes_whitespace(self):
        assert _normalize_taifex_header("到期 月份") == "到期月份"

    def test_removes_asterisk(self):
        assert _normalize_taifex_header("成交量*") == "成交量"
