"""Tests for Pydantic models in site_api.models."""
from __future__ import annotations

import unittest

from pydantic import ValidationError

from site_api.models import (
    InquiryCreate,
    SequenceSyncRequest,
    KnowledgeSyncRequest,
    SequencingRunSyncRequest,
    MarketSyncRequest,
    SequenceUpsertOneRequest,
)


class TestInquiryCreate(unittest.TestCase):
    """Test InquiryCreate model and its validators."""

    def test_valid_inquiry(self):
        """Test that valid input passes validation."""
        inquiry = InquiryCreate(
            name="John Doe",
            email="john@example.com",
            organization="Acme Corp",
            message="This is a test message about something important.",
            source_page="contact.html",
            website="https://example.com",
        )
        self.assertEqual(inquiry.name, "John Doe")
        self.assertEqual(inquiry.email, "john@example.com")
        self.assertEqual(inquiry.organization, "Acme Corp")

    def test_name_too_short(self):
        """Test that names shorter than 2 chars are rejected."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="A",  # Too short
                email="test@example.com",
                message="This is a valid message with enough characters.",
            )

    def test_name_too_long(self):
        """Test that names longer than 120 chars are rejected."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="A" * 121,  # Too long
                email="test@example.com",
                message="This is a valid message with enough characters.",
            )

    def test_email_too_short(self):
        """Test that emails shorter than 5 chars are rejected."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="John",
                email="a@b",  # Too short
                message="This is a valid message with enough characters.",
            )

    def test_email_too_long(self):
        """Test that emails longer than 255 chars are rejected."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="John",
                email="a" * 250 + "@test.com",  # Too long
                message="This is a valid message with enough characters.",
            )

    def test_email_missing_at_sign(self):
        """Test that emails without @ are rejected."""
        with self.assertRaises(ValidationError) as context:
            InquiryCreate(
                name="John",
                email="notanemail.com",
                message="This is a valid message with enough characters.",
            )
        self.assertIn("valid email", str(context.exception))

    def test_email_ending_with_at_sign(self):
        """Test that emails ending with @ are rejected."""
        with self.assertRaises(ValidationError) as context:
            InquiryCreate(
                name="John",
                email="test@",
                message="This is a valid message with enough characters.",
            )
        self.assertIn("valid email", str(context.exception))

    def test_message_too_short(self):
        """Test that messages shorter than 10 chars are rejected."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="John",
                email="john@example.com",
                message="Short",  # Too short
            )

    def test_message_too_long(self):
        """Test that messages longer than 4000 chars are rejected."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="John",
                email="john@example.com",
                message="A" * 4001,  # Too long
            )

    def test_organization_max_length(self):
        """Test that organization is capped at 160 chars."""
        with self.assertRaises(ValidationError):
            InquiryCreate(
                name="John",
                email="john@example.com",
                organization="A" * 161,  # Too long
                message="This is a valid message with enough characters.",
            )

    def test_strip_whitespace(self):
        """Test that string fields are stripped of leading/trailing whitespace."""
        inquiry = InquiryCreate(
            name="  John Doe  ",
            email="  john@example.com  ",
            organization="  Acme  ",
            message="  This is a message  ",
            source_page="  contact.html  ",
        )
        self.assertEqual(inquiry.name, "John Doe")
        self.assertEqual(inquiry.email, "john@example.com")
        self.assertEqual(inquiry.organization, "Acme")
        self.assertEqual(inquiry.message, "This is a message")
        self.assertEqual(inquiry.source_page, "contact.html")

    def test_none_converts_to_empty_string(self):
        """Test that None values are converted to empty strings."""
        inquiry = InquiryCreate(
            name="John",
            email="john@example.com",
            organization=None,
            message="This is a valid message with enough characters.",
            website=None,
        )
        self.assertEqual(inquiry.organization, "")
        self.assertEqual(inquiry.website, "")

    def test_default_values(self):
        """Test default values for optional fields."""
        inquiry = InquiryCreate(
            name="John",
            email="john@example.com",
            message="This is a valid message with enough characters.",
        )
        self.assertEqual(inquiry.organization, "")
        self.assertEqual(inquiry.source_page, "about_me.html")
        self.assertEqual(inquiry.website, "")


class TestSequenceSyncRequest(unittest.TestCase):
    """Test SequenceSyncRequest model and its validators."""

    def test_valid_request(self):
        """Test that valid input passes validation."""
        request = SequenceSyncRequest(
            protein_query="kinase",
            gene_symbols=["TP53", "BRCA1"],
            species="homo_sapiens",
            limit=4,
        )
        self.assertEqual(request.protein_query, "kinase")
        self.assertEqual(request.gene_symbols, ["TP53", "BRCA1"])
        self.assertEqual(request.limit, 4)

    def test_default_values(self):
        """Test default values."""
        request = SequenceSyncRequest()
        self.assertEqual(request.protein_query, "kinase")
        self.assertEqual(request.gene_symbols, ["TP53", "BRCA1", "EGFR", "APOE"])
        self.assertEqual(request.species, "homo_sapiens")
        self.assertEqual(request.limit, 4)

    def test_limit_below_minimum(self):
        """Test that limit below 1 is rejected."""
        with self.assertRaises(ValidationError):
            SequenceSyncRequest(limit=0)

    def test_limit_above_maximum(self):
        """Test that limit above 8 is rejected."""
        with self.assertRaises(ValidationError):
            SequenceSyncRequest(limit=9)

    def test_gene_symbols_string_input(self):
        """Test that comma-separated string is split into list."""
        request = SequenceSyncRequest(gene_symbols="TP53,BRCA1,EGFR")
        self.assertEqual(request.gene_symbols, ["TP53", "BRCA1", "EGFR"])

    def test_gene_symbols_normalized_to_uppercase(self):
        """Test that gene symbols are normalized to uppercase."""
        request = SequenceSyncRequest(gene_symbols=["tp53", "brca1", "EgFr"])
        self.assertEqual(request.gene_symbols, ["TP53", "BRCA1", "EGFR"])

    def test_gene_symbols_deduplication(self):
        """Test that duplicate gene symbols are removed."""
        request = SequenceSyncRequest(gene_symbols=["TP53", "tp53", "BRCA1"])
        self.assertEqual(request.gene_symbols, ["TP53", "BRCA1"])

    def test_gene_symbols_max_8_items(self):
        """Test that gene symbols list is capped at 8 items."""
        symbols = [f"GENE{i}" for i in range(15)]
        request = SequenceSyncRequest(gene_symbols=symbols)
        self.assertEqual(len(request.gene_symbols), 8)

    def test_gene_symbols_none_becomes_empty_list(self):
        """Test that None for gene_symbols becomes empty list."""
        request = SequenceSyncRequest(gene_symbols=None)
        self.assertEqual(request.gene_symbols, [])

    def test_strip_protein_query(self):
        """Test that protein_query is stripped."""
        request = SequenceSyncRequest(protein_query="  kinase  ")
        self.assertEqual(request.protein_query, "kinase")

    def test_strip_species(self):
        """Test that species is stripped."""
        request = SequenceSyncRequest(species="  homo_sapiens  ")
        self.assertEqual(request.species, "homo_sapiens")


class TestKnowledgeSyncRequest(unittest.TestCase):
    """Test KnowledgeSyncRequest model and its validators."""

    def test_valid_request(self):
        """Test that valid input passes validation."""
        request = KnowledgeSyncRequest(
            protein_query="kinase",
            literature_query="kinase AND cancer",
            limit=4,
        )
        self.assertEqual(request.protein_query, "kinase")
        self.assertEqual(request.literature_query, "kinase AND cancer")
        self.assertEqual(request.limit, 4)

    def test_default_values(self):
        """Test default values."""
        request = KnowledgeSyncRequest()
        self.assertEqual(request.protein_query, "kinase")
        self.assertEqual(request.literature_query, "kinase AND cancer")
        self.assertEqual(request.limit, 4)

    def test_limit_below_minimum(self):
        """Test that limit below 1 is rejected."""
        with self.assertRaises(ValidationError):
            KnowledgeSyncRequest(limit=0)

    def test_limit_above_maximum(self):
        """Test that limit above 8 is rejected."""
        with self.assertRaises(ValidationError):
            KnowledgeSyncRequest(limit=9)

    def test_strip_protein_query(self):
        """Test that protein_query is stripped."""
        request = KnowledgeSyncRequest(protein_query="  kinase  ")
        self.assertEqual(request.protein_query, "kinase")

    def test_strip_literature_query(self):
        """Test that literature_query is stripped."""
        request = KnowledgeSyncRequest(literature_query="  kinase AND cancer  ")
        self.assertEqual(request.literature_query, "kinase AND cancer")

    def test_none_protein_query_becomes_empty(self):
        """Test that None protein_query becomes empty string."""
        request = KnowledgeSyncRequest(protein_query=None)
        self.assertEqual(request.protein_query, "")


class TestSequencingRunSyncRequest(unittest.TestCase):
    """Test SequencingRunSyncRequest model and its validators."""

    def test_valid_request(self):
        """Test that valid input passes validation."""
        request = SequencingRunSyncRequest(
            query='tax_name("Homo sapiens") AND library_strategy="RNA-Seq"',
            limit=4,
        )
        self.assertEqual(
            request.query, 'tax_name("Homo sapiens") AND library_strategy="RNA-Seq"'
        )
        self.assertEqual(request.limit, 4)

    def test_default_values(self):
        """Test default values."""
        request = SequencingRunSyncRequest()
        self.assertIn("Homo sapiens", request.query)
        self.assertEqual(request.limit, 4)

    def test_limit_below_minimum(self):
        """Test that limit below 1 is rejected."""
        with self.assertRaises(ValidationError):
            SequencingRunSyncRequest(limit=0)

    def test_limit_above_maximum(self):
        """Test that limit above 12 is rejected."""
        with self.assertRaises(ValidationError):
            SequencingRunSyncRequest(limit=13)

    def test_strip_query(self):
        """Test that query is stripped."""
        request = SequencingRunSyncRequest(query="  test query  ")
        self.assertEqual(request.query, "test query")

    def test_none_query_becomes_empty(self):
        """Test that None query becomes empty string."""
        request = SequencingRunSyncRequest(query=None)
        self.assertEqual(request.query, "")


class TestMarketSyncRequest(unittest.TestCase):
    """Test MarketSyncRequest model and its validators."""

    def test_valid_request(self):
        """Test that valid input passes validation."""
        request = MarketSyncRequest(
            stock_symbols=["2330", "2317"],
            etf_symbols=["0050", "0056"],
            futures_symbols=["ES=F"],
            twse_months=3,
            yahoo_range="3mo",
        )
        self.assertEqual(request.stock_symbols, ["2330", "2317"])
        self.assertEqual(request.twse_months, 3)
        self.assertEqual(request.yahoo_range, "3mo")

    def test_default_values(self):
        """Test default values."""
        request = MarketSyncRequest()
        self.assertEqual(request.stock_symbols, ["2330", "2317"])
        self.assertEqual(request.etf_symbols, ["0050", "0056"])
        self.assertEqual(request.futures_symbols, ["ES=F", "NQ=F"])
        self.assertEqual(request.twse_months, 3)
        self.assertEqual(request.yahoo_range, "3mo")

    def test_twse_months_below_minimum(self):
        """Test that twse_months below 1 is rejected."""
        with self.assertRaises(ValidationError):
            MarketSyncRequest(twse_months=0)

    def test_twse_months_above_maximum(self):
        """Test that twse_months above 12 is rejected."""
        with self.assertRaises(ValidationError):
            MarketSyncRequest(twse_months=13)

    def test_stock_symbols_string_input(self):
        """Test that comma-separated string is split into list."""
        request = MarketSyncRequest(stock_symbols="2330,2317,2303")
        self.assertEqual(request.stock_symbols, ["2330", "2317", "2303"])

    def test_symbols_normalized_to_uppercase(self):
        """Test that symbols are normalized to uppercase."""
        request = MarketSyncRequest(stock_symbols=["2330", "es=f"])
        self.assertEqual(request.stock_symbols, ["2330", "ES=F"])

    def test_symbols_deduplication(self):
        """Test that duplicate symbols are removed."""
        request = MarketSyncRequest(stock_symbols=["2330", "2330", "2317"])
        self.assertEqual(request.stock_symbols, ["2330", "2317"])

    def test_symbols_max_20_items(self):
        """Test that symbols list is capped at 20 items."""
        symbols = [f"SYM{i}" for i in range(25)]
        request = MarketSyncRequest(stock_symbols=symbols)
        self.assertEqual(len(request.stock_symbols), 20)

    def test_symbols_none_becomes_empty_list(self):
        """Test that None for symbols becomes empty list."""
        request = MarketSyncRequest(stock_symbols=None)
        self.assertEqual(request.stock_symbols, [])

    def test_yahoo_range_valid_values(self):
        """Test that valid yahoo_range values are accepted."""
        for valid_range in ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]:
            request = MarketSyncRequest(yahoo_range=valid_range)
            self.assertEqual(request.yahoo_range, valid_range)

    def test_yahoo_range_invalid_value(self):
        """Test that invalid yahoo_range values are rejected."""
        with self.assertRaises(ValidationError) as context:
            MarketSyncRequest(yahoo_range="invalid")
        self.assertIn("yahoo_range", str(context.exception))

    def test_yahoo_range_normalized_to_lowercase(self):
        """Test that yahoo_range is normalized to lowercase."""
        request = MarketSyncRequest(yahoo_range="3MO")
        self.assertEqual(request.yahoo_range, "3mo")

    def test_yahoo_range_none_defaults_to_3mo(self):
        """Test that None yahoo_range defaults to 3mo."""
        request = MarketSyncRequest(yahoo_range=None)
        self.assertEqual(request.yahoo_range, "3mo")


class TestSequenceUpsertOneRequest(unittest.TestCase):
    """Test SequenceUpsertOneRequest model and its validators."""

    def test_valid_request(self):
        """Test that valid input passes validation."""
        request = SequenceUpsertOneRequest(
            source_id="PDB:1A2B",
            display_name="Test Protein",
            organism="Homo sapiens",
            sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            description="A test protein sequence",
            record_url="https://example.com/protein",
            query_term="kinase",
            source_name="RCSB",
            sequence_type="protein",
        )
        self.assertEqual(request.source_id, "PDB:1A2B")
        self.assertEqual(request.display_name, "Test Protein")

    def test_source_id_too_short(self):
        """Test that source_id cannot be empty."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(
                source_id="",
                sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            )

    def test_source_id_too_long(self):
        """Test that source_id is capped at 64 chars."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(
                source_id="A" * 65,
                sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            )

    def test_sequence_normalized_to_uppercase(self):
        """Test that sequence is converted to uppercase."""
        request = SequenceUpsertOneRequest(
            source_id="TEST1",
            sequence="mktiialsyifclvfadykdddkgvvivekydphddddhhshr",
        )
        self.assertEqual(request.sequence, "MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR")

    def test_sequence_cannot_be_empty(self):
        """Test that sequence cannot be empty."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(source_id="TEST1", sequence="")

    def test_display_name_max_length(self):
        """Test that display_name is capped at 255 chars."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(
                source_id="TEST1",
                display_name="A" * 256,
                sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            )

    def test_organism_max_length(self):
        """Test that organism is capped at 160 chars."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(
                source_id="TEST1",
                organism="A" * 161,
                sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            )

    def test_description_max_length(self):
        """Test that description is capped at 500 chars."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(
                source_id="TEST1",
                description="A" * 501,
                sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            )

    def test_record_url_max_length(self):
        """Test that record_url is capped at 500 chars."""
        with self.assertRaises(ValidationError):
            SequenceUpsertOneRequest(
                source_id="TEST1",
                record_url="https://" + "a" * 500,
                sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
            )

    def test_strip_string_fields(self):
        """Test that string fields are stripped."""
        request = SequenceUpsertOneRequest(
            source_id="  TEST1  ",
            display_name="  Test Protein  ",
            organism="  Homo sapiens  ",
            sequence="  MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR  ",
            query_term="  kinase  ",
        )
        self.assertEqual(request.source_id, "TEST1")
        self.assertEqual(request.display_name, "Test Protein")
        self.assertEqual(request.organism, "Homo sapiens")
        self.assertIn("M", request.sequence[0])  # Uppercase and stripped
        self.assertEqual(request.query_term, "kinase")

    def test_default_values(self):
        """Test default values."""
        request = SequenceUpsertOneRequest(
            source_id="TEST1",
            sequence="MKTIIALSYIFCLVFADYKDDDKGVVIVEKYDPHDDDDHHSHR",
        )
        self.assertEqual(request.display_name, "")
        self.assertEqual(request.organism, "")
        self.assertEqual(request.description, "")
        self.assertEqual(request.record_url, "")
        self.assertEqual(request.query_term, "")
        self.assertEqual(request.source_name, "RCSB")
        self.assertEqual(request.sequence_type, "protein")


if __name__ == "__main__":
    unittest.main()
