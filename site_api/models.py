from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class InquiryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    organization: str = Field(default="", max_length=160)
    message: str = Field(min_length=10, max_length=4000)
    source_page: str = Field(default="about_me.html", max_length=120)
    website: str = Field(default="", max_length=200)

    @field_validator("name", "email", "organization", "message", "source_page", "website", mode="before")
    @classmethod
    def strip_strings(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or value.endswith("@"):
            raise ValueError("Please provide a valid email address.")
        return value


class SequenceSyncRequest(BaseModel):
    protein_query: str = Field(default="kinase")
    gene_symbols: list[str] = Field(default_factory=lambda: ["TP53", "BRCA1", "EGFR", "APOE"])
    species: str = Field(default="homo_sapiens")
    limit: int = Field(default=4, ge=1, le=8)

    @field_validator("protein_query", "species", mode="before")
    @classmethod
    def strip_scalar_fields(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("gene_symbols", mode="before")
    @classmethod
    def normalize_gene_symbols(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = value.split(",")
        cleaned: list[str] = []
        for item in value:
            normalized = str(item).strip().upper()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned[:8]


class KnowledgeSyncRequest(BaseModel):
    protein_query: str = Field(default="kinase")
    literature_query: str = Field(default="kinase AND cancer")
    scholar_query: str = Field(default="")
    geo_query: str = Field(default="")
    openalex_query: str = Field(default="")
    interpro_uniprot_ids: list[str] = Field(default_factory=list)
    limit: int = Field(default=4, ge=1, le=8)

    @field_validator("protein_query", "literature_query", mode="before")
    @classmethod
    def strip_query_fields(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class SequencingRunSyncRequest(BaseModel):
    query: str = Field(default='tax_name("Homo sapiens") AND library_strategy="RNA-Seq"')
    limit: int = Field(default=4, ge=1, le=12)

    @field_validator("query", mode="before")
    @classmethod
    def strip_query(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class MarketSyncRequest(BaseModel):
    stock_symbols: list[str] = Field(default_factory=lambda: ["2330", "2317"])
    etf_symbols: list[str] = Field(default_factory=lambda: ["0050", "0056"])
    futures_symbols: list[str] = Field(default_factory=lambda: ["ES=F", "NQ=F"])
    twse_months: int = Field(default=3, ge=1, le=120)
    yahoo_range: str = Field(default="3mo")

    @field_validator("stock_symbols", "etf_symbols", "futures_symbols", mode="before")
    @classmethod
    def normalize_symbol_list(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            value = value.split(",")

        cleaned: list[str] = []
        for item in value:
            normalized = str(item or "").strip().upper()
            if normalized and normalized not in cleaned:
                cleaned.append(normalized)
        return cleaned[:20]

    @field_validator("yahoo_range", mode="before")
    @classmethod
    def validate_yahoo_range(cls, value: Any) -> str:
        normalized = str(value or "3mo").strip().lower() or "3mo"
        allowed_ranges = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}
        if normalized not in allowed_ranges:
            raise ValueError("yahoo_range must be one of 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max.")
        return normalized


class SequenceUpsertOneRequest(BaseModel):
    source_id: str = Field(min_length=1, max_length=64)
    display_name: str = Field(default="", max_length=255)
    organism: str = Field(default="", max_length=160)
    sequence: str = Field(min_length=1)
    description: str = Field(default="", max_length=500)
    record_url: str = Field(default="", max_length=500)
    query_term: str = Field(default="", max_length=160)
    source_name: str = Field(default="RCSB", max_length=32)
    sequence_type: str = Field(default="protein", max_length=16)

    @field_validator("sequence", mode="before")
    @classmethod
    def normalize_sequence(cls, value: Any) -> str:
        return str(value or "").strip().upper()

    @field_validator("source_id", "display_name", "organism", "description",
                     "record_url", "query_term", "source_name", "sequence_type", mode="before")
    @classmethod
    def strip_str(cls, value: Any) -> str:
        return str(value or "").strip()


_VALID_AA = frozenset("ACDEFGHIKLMNPQRSTVWY")


class StructurePredictionSyncRequest(BaseModel):
    uniprot_ids: list[str] = Field(default_factory=lambda: ["P04637", "P38398"])
    limit: int = Field(default=4, ge=1, le=20)

    @field_validator("uniprot_ids", mode="before")
    @classmethod
    def normalize_ids(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            value = value.split(",")
        return [str(v).strip().upper() for v in (value or []) if str(v).strip()][:20]


class VariantSyncRequest(BaseModel):
    gene_symbol: str = Field(default="TP53")
    include_cosmic: bool = Field(default=False)
    limit: int = Field(default=8, ge=1, le=30)

    @field_validator("gene_symbol", mode="before")
    @classmethod
    def strip_gene(cls, value: Any) -> str:
        return str(value or "TP53").strip().upper()


class PopulationSyncRequest(BaseModel):
    gene_symbol: str = Field(default="TP53")
    dataset: str = Field(default="gnomad_r4")
    limit: int = Field(default=12, ge=1, le=50)


class InteractionSyncRequest(BaseModel):
    identifiers: list[str] = Field(default_factory=lambda: ["TP53", "BRCA1", "MDM2"])
    species: int = Field(default=9606)
    limit: int = Field(default=20, ge=1, le=50)

    @field_validator("identifiers", mode="before")
    @classmethod
    def normalize_ids(cls, value: Any) -> list[str]:
        if isinstance(value, str):
            value = value.split(",")
        return [str(v).strip() for v in (value or []) if str(v).strip()][:10]


class EconomicSyncRequest(BaseModel):
    series_ids: list[str] = Field(default_factory=lambda: ["GDP", "UNRATE", "DFF", "CPIAUCSL"])
    limit: int = Field(default=120, ge=1, le=500)


class OpenTargetsSyncRequest(BaseModel):
    gene_symbol: str = Field(default="TP53")
    limit: int = Field(default=10, ge=1, le=30)


class ChEMBLSyncRequest(BaseModel):
    gene_symbol: str = Field(default="TP53")
    limit: int = Field(default=12, ge=1, le=30)


class PathwaySyncRequest(BaseModel):
    gene_symbol: str = Field(default="TP53")
    uniprot_id: str = Field(default="")
    limit: int = Field(default=10, ge=1, le=30)


class ESM2ScoreRequest(BaseModel):
    """Request body for the /api/esm2/score proxy endpoint."""

    sequence: str = Field(min_length=2, max_length=500)
    positions: list[int] | None = Field(
        default=None,
        description="Positions to score (0-based). Scores all positions if omitted.",
    )

    @field_validator("sequence", mode="before")
    @classmethod
    def normalize_and_validate_sequence(cls, value: Any) -> str:
        seq = str(value or "").strip().upper()
        invalid = set(seq) - _VALID_AA
        if invalid:
            raise ValueError(f"Non-standard amino acids: {sorted(invalid)}")
        return seq
