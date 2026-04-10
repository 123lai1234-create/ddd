"""
Tests for site_api.knowledge_sources — UniProt/PubMed data extraction.
"""

from site_api.knowledge_sources import (
    _join_unique,
    _truncate,
    _extract_gene_names,
    _extract_keywords,
    _extract_comment_texts,
    _extract_pubmed_ids,
)


class TestJoinUnique:
    def test_deduplication(self):
        result = _join_unique(["a", "b", "a", "c"])
        assert result == ["a", "b", "c"]

    def test_limit(self):
        result = _join_unique(["a", "b", "c", "d"], limit=2)
        assert result == ["a", "b"]

    def test_strips_whitespace(self):
        result = _join_unique(["  hello  ", "world", "hello"])
        assert result == ["hello", "world"]

    def test_skips_empty(self):
        result = _join_unique(["", None, "valid", ""])
        assert result == ["valid"]


class TestTruncate:
    def test_short_text(self):
        assert _truncate("hello", 100) == "hello"

    def test_long_text_truncated(self):
        text = "a" * 100
        result = _truncate(text, 50)
        assert len(result) <= 50
        assert result.endswith("...")

    def test_normalizes_whitespace(self):
        assert _truncate("  hello   world  ") == "hello world"

    def test_none_input(self):
        assert _truncate(None) == ""


class TestExtractGeneNames:
    def test_primary_and_synonyms(self):
        result = {
            "genes": [
                {
                    "geneName": {"value": "TP53"},
                    "synonyms": [{"value": "P53"}],
                }
            ]
        }
        names = _extract_gene_names(result)
        assert "TP53" in names
        assert "P53" in names

    def test_empty_genes(self):
        assert _extract_gene_names({}) == []
        assert _extract_gene_names({"genes": []}) == []


class TestExtractKeywords:
    def test_basic_keywords(self):
        result = {
            "keywords": [
                {"name": "Kinase"},
                {"name": "Phosphorylation"},
            ]
        }
        keywords = _extract_keywords(result)
        assert "Kinase" in keywords
        assert "Phosphorylation" in keywords

    def test_empty_keywords(self):
        assert _extract_keywords({}) == []


class TestExtractCommentTexts:
    def test_function_comments(self):
        result = {
            "comments": [
                {
                    "commentType": "FUNCTION",
                    "texts": [{"value": "Catalyzes phosphorylation"}],
                }
            ]
        }
        texts = _extract_comment_texts(result, "FUNCTION")
        assert "Catalyzes phosphorylation" in texts

    def test_disease_comments(self):
        result = {
            "comments": [
                {
                    "commentType": "DISEASE",
                    "texts": [],
                    "disease": {"description": "Associated with cancer"},
                }
            ]
        }
        texts = _extract_comment_texts(result, "DISEASE")
        assert "Associated with cancer" in texts

    def test_wrong_type_returns_empty(self):
        result = {
            "comments": [
                {
                    "commentType": "FUNCTION",
                    "texts": [{"value": "Some text"}],
                }
            ]
        }
        assert _extract_comment_texts(result, "DISEASE") == []


class TestExtractPubmedIds:
    def test_extracts_ids(self):
        result = {
            "references": [
                {
                    "citation": {
                        "citationCrossReferences": [
                            {"database": "PubMed", "id": "12345678"},
                        ]
                    }
                }
            ]
        }
        ids = _extract_pubmed_ids(result)
        assert "12345678" in ids

    def test_empty_references(self):
        assert _extract_pubmed_ids({}) == []
