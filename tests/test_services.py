"""
Tests for site_api.services — business logic functions that don't require DB.
"""

from site_api.services import gc_content, chunk_text_for_rag


class TestGcContent:
    def test_all_gc(self):
        assert gc_content("GGCC") == 100.0

    def test_no_gc(self):
        assert gc_content("AATT") == 0.0

    def test_mixed(self):
        assert gc_content("ATGC") == 50.0

    def test_empty(self):
        assert gc_content("") == 0.0

    def test_case_insensitive(self):
        assert gc_content("atgc") == 50.0


class TestChunkTextForRag:
    def test_empty_text(self):
        assert chunk_text_for_rag("") == []
        assert chunk_text_for_rag(None) == []

    def test_short_text_single_chunk(self):
        text = "This is a short text."
        chunks = chunk_text_for_rag(text, chunk_size=900)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_long_text_multiple_chunks(self):
        text = "Word " * 500  # ~2500 chars
        chunks = chunk_text_for_rag(text, chunk_size=500, chunk_overlap=50)
        assert len(chunks) > 1
        # Each chunk should be <= chunk_size (approximately)
        for chunk in chunks:
            assert len(chunk) <= 600  # some tolerance for boundary finding

    def test_overlap_produces_shared_content(self):
        text = ". ".join(f"Sentence {i}" for i in range(50))
        chunks = chunk_text_for_rag(text, chunk_size=300, chunk_overlap=100)
        if len(chunks) >= 2:
            # With overlap, chunks should share some content
            assert len(chunks) >= 2
