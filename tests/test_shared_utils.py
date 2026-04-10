"""
Tests for site_api.shared_utils — shared utility functions.
"""

from site_api.shared_utils import protein_name, parse_int_safe


class TestProteinName:
    def test_recommended_name(self):
        result = {
            "proteinDescription": {
                "recommendedName": {"fullName": {"value": "Kinase ABC"}}
            }
        }
        assert protein_name(result) == "Kinase ABC"

    def test_submission_name_fallback(self):
        result = {
            "proteinDescription": {
                "submissionNames": [{"fullName": {"value": "Submitted protein"}}]
            }
        }
        assert protein_name(result) == "Submitted protein"

    def test_uniprotkbid_fallback(self):
        result = {"uniProtkbId": "P12345_HUMAN"}
        assert protein_name(result) == "P12345_HUMAN"

    def test_empty_result(self):
        assert protein_name({}) == "Unnamed protein"

    def test_strips_whitespace(self):
        result = {
            "proteinDescription": {
                "recommendedName": {"fullName": {"value": "  Kinase  "}}
            }
        }
        assert protein_name(result) == "Kinase"


class TestParseIntSafe:
    def test_normal_int(self):
        assert parse_int_safe("42") == 42

    def test_with_commas(self):
        assert parse_int_safe("1,234,567") == 1234567

    def test_float_string(self):
        assert parse_int_safe("99.7") == 99

    def test_none_input(self):
        assert parse_int_safe(None) is None

    def test_empty_string(self):
        assert parse_int_safe("") is None

    def test_non_numeric(self):
        assert parse_int_safe("abc") is None

    def test_int_input(self):
        assert parse_int_safe(100) == 100
