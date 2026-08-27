"""
Tests for site_api.services — serialize functions, cache behaviour,
and business logic that doesn't require a real DB connection.
"""

from __future__ import annotations

import unittest

# Import the service functions directly (no FastAPI bootstrap needed)
from site_api.services import (
    gc_content,
    serialize_sequence_row,
    serialize_sequencing_run_row,
    serialize_market_instrument_row,
    serialize_market_bar_row,
    serialize_interaction_row,
    serialize_variant_row,
    serialize_population_row,
    serialize_economic_indicator_row,
    serialize_structure_prediction_row,
    serialize_opentargets_row,
    serialize_chembl_row,
    chunk_text_for_rag,
    build_sequence_rag_documents,
    build_knowledge_rag_documents,
    _cached_summary,
    _summary_cache,
    _CACHE_TTL,
)


# ─────────────────────────────────────────────────────────────────────
# gc_content
# ─────────────────────────────────────────────────────────────────────

class TestGcContent(unittest.TestCase):
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

    def test_dna_sequence(self):
        assert gc_content("ACGTACGT") == 50.0

    def test_single_base(self):
        assert gc_content("G") == 100.0
        assert gc_content("A") == 0.0


# ─────────────────────────────────────────────────────────────────────
# serialize_sequence_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeSequenceRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [
            1, "protein", "UniProt", "P53_HUMAN", "kinase",
            "Tumor protein p53", "Homo sapiens", "MEEPQSDPSV",
            10, "Tumor suppressor",
            "https://rest.uniprot.org/uniprotkb/P04637",
            "2024-01-01T00:00:00",
        ]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_sequence_row(self._make_row())
        assert result["id"] == 1
        assert result["source_name"] == "UniProt"
        assert result["source_id"] == "P53_HUMAN"
        assert result["sequence"] == "MEEPQSDPSV"
        assert result["sequence_length"] == 10
        assert result["organism"] == "Homo sapiens"

    def test_sequence_uppercase(self):
        result = serialize_sequence_row(self._make_row(sequence="mgetegrqsa"))
        assert result["sequence"] == "MGETEGRQSA"

    def test_missing_optional_fields(self):
        result = serialize_sequence_row(
            self._make_row(display_name="", description="", record_url="")
        )
        assert result["display_name"] == ""
        assert result["description"] == ""


# ─────────────────────────────────────────────────────────────────────
# serialize_market_instrument_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeMarketInstrumentRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [
            1, "TWSE", "2330", "TSMC", "台積電",
            "2024-01-01", None, 10.5, "TWD", "2024-06-01T00:00:00",
        ]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_market_instrument_row(self._make_row())
        assert result["symbol"] == "2330"
        assert result["market"] == "TWSE"
        assert result["name"] == "TSMC"
        assert result["close_price"] == 10.5
        assert result["delisted_date"] is None

    def test_delisted(self):
        result = serialize_market_instrument_row(
            self._make_row(delisted_date="2024-06-01")
        )
        assert result["delisted_date"] == "2024-06-01"


# ─────────────────────────────────────────────────────────────────────
# serialize_market_bar_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeMarketBarRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [
            1, "2330", "2024-06-01",
            950.0, 960.0, 945.0, 955.0, 50000,
            "2024-06-01T00:00:00",
        ]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_market_bar_row(self._make_row())
        assert result["symbol"] == "2330"
        assert result["date"] == "2024-06-01"
        assert result["open"] == 950.0
        assert result["high"] == 960.0
        assert result["low"] == 945.0
        assert result["close"] == 955.0
        assert result["volume"] == 50000

    def test_types(self):
        result = serialize_market_bar_row(self._make_row())
        assert isinstance(result["open"], float)
        assert isinstance(result["volume"], int)


# ─────────────────────────────────────────────────────────────────────
# serialize_variant_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeVariantRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "rs123456", "chr1", 100000, "A", "G",
                    "missense_variant", 0.001, "benign", "2024-01-01T00:00:00"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_variant_row(self._make_row())
        assert result["rsid"] == "rs123456"
        assert result["chrom"] == "chr1"
        assert result["pos"] == 100000
        assert result["ref"] == "A"
        assert result["alt"] == "G"

    def test_none_allele_freq(self):
        result = serialize_variant_row(self._make_row(allele_freq=None))
        assert result["allele_freq"] is None


# ─────────────────────────────────────────────────────────────────────
# serialize_population_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializePopulationRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "TP53", "Homo sapiens", 1234, 5678, 0.0001, "2024-01-01"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_population_row(self._make_row())
        assert result["gene"] == "TP53"
        assert result["sample_size"] == 1234


# ─────────────────────────────────────────────────────────────────────
# serialize_interaction_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeInteractionRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "TP53", "MDM2", 999.5, "physical",
                    "https://string-db.org/cgi/protein"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_interaction_row(self._make_row())
        assert result["protein_a"] == "TP53"
        assert result["protein_b"] == "MDM2"
        assert result["score"] == 999.5


# ─────────────────────────────────────────────────────────────────────
# serialize_economic_indicator_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeEconomicIndicatorRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "US", "GDP", 21000000, "USD", "2024-01-01", "2024-03-31"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_economic_indicator_row(self._make_row())
        assert result["country"] == "US"
        assert result["indicator"] == "GDP"


# ─────────────────────────────────────────────────────────────────────
# serialize_structure_prediction_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeStructurePredictionRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "AF-P04637F1", "P53_HUMAN", 10.5, 0.85,
                    "2024-01-01T00:00:00"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_structure_prediction_row(self._make_row())
        assert result["model_id"] == "AF-P04637F1"
        assert result["pLDDT"] == 10.5
        assert result["mean_pAE"] == 0.85


# ─────────────────────────────────────────────────────────────────────
# serialize_opentargets_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeOpentargetsRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "ENSG00000141510", "TP53", "EFO_0003862",
                    "cancer", 0.85, "https://platform.opentargets.org"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_opentargets_row(self._make_row())
        assert result["gene_id"] == "ENSG00000141510"
        assert result["gene_symbol"] == "TP53"
        assert result["score"] == 0.85


# ─────────────────────────────────────────────────────────────────────
# serialize_chembl_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeChemblRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "CHEMBL1234567", "Paracetamol",
                    "CC(=O)Nc1ccc(cc1)O", 5.2, "Phase IV",
                    "https://www.ebi.ac.uk/chembl compound/CHEMBL1234567"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_chembl_row(self._make_row())
        assert result["chembl_id"] == "CHEMBL1234567"
        assert result["name"] == "Paracetamol"
        assert result["phase"] == "Phase IV"


# ─────────────────────────────────────────────────────────────────────
# serialize_sequencing_run_row
# ─────────────────────────────────────────────────────────────────────

class TestSerializeSequencingRunRow(unittest.TestCase):
    def _make_row(self, **overrides):
        defaults = [1, "SRR12345678", "Homo sapiens", "RNA-Seq",
                    1000000000, "ILLUMINA", "2024-01-01",
                    "https://trace.ncbi.nlm.nih.gov/Traces/sra?run=SRR12345678",
                    "2024-01-01T00:00:00"]
        for k, v in overrides.items():
            idx = list(overrides.keys()).index(k)
            defaults[idx] = v
        return tuple(defaults)

    def test_basic(self):
        result = serialize_sequencing_run_row(self._make_row())
        assert result["run_id"] == "SRR12345678"
        assert result["organism"] == "Homo sapiens"
        assert result["library_strategy"] == "RNA-Seq"
        assert result["read_count"] == 1000000000


# ─────────────────────────────────────────────────────────────────────
# chunk_text_for_rag
# ─────────────────────────────────────────────────────────────────────

class TestChunkTextForRag(unittest.TestCase):
    def test_empty_text(self):
        assert chunk_text_for_rag("") == []
        assert chunk_text_for_rag(None) == []

    def test_short_text_single_chunk(self):
        text = "This is a short text."
        chunks = chunk_text_for_rag(text, chunk_size=900)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_long_text_multiple_chunks(self):
        text = "Word " * 500
        chunks = chunk_text_for_rag(text, chunk_size=500, chunk_overlap=50)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 600

    def test_none_returns_empty_list(self):
        assert chunk_text_for_rag(None) == []

    def test_whitespace_only(self):
        assert chunk_text_for_rag("   \n\t  ") == []


# ─────────────────────────────────────────────────────────────────────
# build_sequence_rag_documents
# ─────────────────────────────────────────────────────────────────────

class TestBuildSequenceRagDocuments(unittest.TestCase):
    def test_empty_sequences(self):
        assert build_sequence_rag_documents([]) == []

    def test_single_sequence(self):
        records = [{
            "source_id": "P53_HUMAN",
            "display_name": "Tumor protein p53",
            "organism": "Homo sapiens",
            "sequence": "MEEPQSDPSVEPPLSQETFSDLWKLLPEN",
            "description": "Tumor suppressor",
            "source_name": "UniProt",
        }]
        docs = build_sequence_rag_documents(records)
        assert len(docs) >= 1
        first_doc = docs[0]
        content_lower = first_doc["content"].lower()
        # Should contain some identifying info
        assert ("p53" in content_lower or "tumor" in content_lower
                or "P53" in first_doc["content"])

    def test_multiple_sequences(self):
        records = [{
            "source_id": f"RECORD{i}",
            "display_name": f"Protein {i}",
            "organism": "Homo sapiens",
            "sequence": "M" * 50,
            "description": f"Description {i}",
            "source_name": "Test",
        } for i in range(3)]
        docs = build_sequence_rag_documents(records)
        assert len(docs) >= len(records)


# ─────────────────────────────────────────────────────────────────────
# build_knowledge_rag_documents
# ─────────────────────────────────────────────────────────────────────

class TestBuildKnowledgeRagDocuments(unittest.TestCase):
    def test_empty(self):
        assert build_knowledge_rag_documents([]) == []

    def test_single_record(self):
        records = [{
            "pmid": "12345",
            "title": "Kinase inhibitors in cancer therapy",
            "abstract": "This paper reviews kinase inhibitors...",
            "source_name": "PubMed",
        }]
        docs = build_knowledge_rag_documents(records)
        assert len(docs) >= 1
        assert "12345" in docs[0]["content"] or "kinase" in docs[0]["content"].lower()

    def test_record_without_abstract(self):
        records = [{"pmid": "99999", "title": "Test paper",
                   "abstract": "", "source_name": "PubMed"}]
        docs = build_knowledge_rag_documents(records)
        assert len(docs) >= 1


# ─────────────────────────────────────────────────────────────────────
# _cached_summary
# ─────────────────────────────────────────────────────────────────────

class TestCachedSummary(unittest.TestCase):
    def setUp(self):
        _summary_cache.clear()

    def tearDown(self):
        _summary_cache.clear()

    def test_cache_hit(self):
        call_count = 0

        def expensive_fn():
            nonlocal call_count
            call_count += 1
            return {"value": 42}

        result1 = _cached_summary("test-key-1", expensive_fn)
        assert result1 == {"value": 42}
        assert call_count == 1

        # Cache hit — does NOT re-run fn
        result2 = _cached_summary("test-key-1", expensive_fn)
        assert result2 == {"value": 42}
        assert call_count == 1

    def test_different_keys_independent(self):
        call_count = 0

        def fn():
            nonlocal call_count
            call_count += 1
            return {"n": call_count}

        _cached_summary("key-a", fn)
        _cached_summary("key-b", fn)
        assert call_count == 2

    def test_cache_miss_after_ttl_bypassed(self):
        """Manually age the cache entry to force expiry."""
        import time as _t_module
        call_count = 0
        key = "expiry-test-key"

        def fn():
            nonlocal call_count
            call_count += 1
            return {"n": call_count}

        result1 = _cached_summary(key, fn)
        assert result1 == {"n": 1}
        assert call_count == 1

        # Manually push timestamp past TTL
        _summary_cache[key] = (_t_module.time() - _CACHE_TTL - 1, {"n": 1})
        result2 = _cached_summary(key, fn)
        assert result2 == {"n": 2}
        assert call_count == 2


if __name__ == "__main__":
    unittest.main()
