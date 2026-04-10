"""
SQL schema constants for site_api database tables and operations.

This module contains all SQL DDL (Data Definition Language) statements and DML
(Data Manipulation Language) statements for managing the site_api database schema,
including table creation, index management, and upsert operations for core and
market data structures.
"""

CREATE_INQUIRIES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS site_inquiries (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL,
    organization VARCHAR(160),
    message TEXT NOT NULL,
    source_page VARCHAR(120) NOT NULL DEFAULT 'about_me.html',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

CREATE_SEQUENCE_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sequence_library (
    id BIGSERIAL PRIMARY KEY,
    sequence_type VARCHAR(16) NOT NULL,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(160) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    organism VARCHAR(160) NOT NULL,
    sequence TEXT NOT NULL,
    sequence_length INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sequence_type, source_name, source_id)
);
"""

CREATE_KNOWLEDGE_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS knowledge_library (
    id BIGSERIAL PRIMARY KEY,
    record_type VARCHAR(32) NOT NULL,
    source_name VARCHAR(64) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(200) NOT NULL,
    title VARCHAR(500) NOT NULL,
    organism VARCHAR(160) NOT NULL DEFAULT '',
    summary_text TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    published_at VARCHAR(64) NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(record_type, source_name, source_id)
);
"""

CREATE_SEQUENCING_RUN_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS sequencing_run_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(240) NOT NULL,
    study_accession VARCHAR(64) NOT NULL DEFAULT '',
    experiment_accession VARCHAR(64) NOT NULL DEFAULT '',
    sample_accession VARCHAR(64) NOT NULL DEFAULT '',
    organism VARCHAR(160) NOT NULL DEFAULT '',
    library_strategy VARCHAR(64) NOT NULL DEFAULT '',
    library_source VARCHAR(64) NOT NULL DEFAULT '',
    library_layout VARCHAR(32) NOT NULL DEFAULT '',
    instrument_platform VARCHAR(64) NOT NULL DEFAULT '',
    instrument_model VARCHAR(160) NOT NULL DEFAULT '',
    read_count BIGINT,
    base_count BIGINT,
    fastq_bytes BIGINT,
    published_at VARCHAR(64) NOT NULL DEFAULT '',
    ftp_url TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, source_id)
);
"""

CREATE_MARKET_INSTRUMENTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS market_instruments (
    id BIGSERIAL PRIMARY KEY,
    asset_type VARCHAR(16) NOT NULL,
    source_name VARCHAR(32) NOT NULL,
    symbol VARCHAR(64) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    market VARCHAR(64) NOT NULL DEFAULT '',
    currency VARCHAR(16) NOT NULL DEFAULT '',
    exchange_name VARCHAR(120) NOT NULL DEFAULT '',
    reference_url TEXT NOT NULL DEFAULT '',
    metadata_text TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, symbol)
);
"""

CREATE_MARKET_PRICE_BARS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS market_price_bars (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    symbol VARCHAR(64) NOT NULL,
    asset_type VARCHAR(16) NOT NULL,
    market VARCHAR(64) NOT NULL DEFAULT '',
    contract_month VARCHAR(16) NOT NULL DEFAULT '',
    trade_date DATE NOT NULL,
    open_price DOUBLE PRECISION,
    high_price DOUBLE PRECISION,
    low_price DOUBLE PRECISION,
    close_price DOUBLE PRECISION,
    settlement_price DOUBLE PRECISION,
    volume BIGINT,
    turnover DOUBLE PRECISION,
    open_interest BIGINT,
    change_value DOUBLE PRECISION,
    raw_payload TEXT NOT NULL DEFAULT '',
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

ALTER_MARKET_PRICE_BARS_ADD_CONTRACT_MONTH_SQL = """
ALTER TABLE market_price_bars
ADD COLUMN IF NOT EXISTS contract_month VARCHAR(16) NOT NULL DEFAULT '';
"""

DROP_LEGACY_MARKET_PRICE_BARS_UNIQUE_SQL = """
DO $$
DECLARE legacy_constraint_name text;
BEGIN
        SELECT con.conname
            INTO legacy_constraint_name
            FROM pg_constraint AS con
            JOIN pg_class AS rel ON rel.oid = con.conrelid
            JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace
         WHERE rel.relname = 'market_price_bars'
             AND ns.nspname = current_schema()
             AND con.contype = 'u'
             AND ARRAY(
                        SELECT att.attname
                            FROM unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord)
                            JOIN pg_attribute AS att
                                ON att.attrelid = rel.oid
                             AND att.attnum = cols.attnum
                         ORDER BY cols.ord
             ) = ARRAY['source_name', 'symbol', 'trade_date'];

        IF legacy_constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE market_price_bars DROP CONSTRAINT %I', legacy_constraint_name);
        END IF;
END $$;
"""

CREATE_MARKET_PRICE_BARS_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS market_price_bars_source_symbol_contract_trade_date_uidx
        ON market_price_bars (source_name, symbol, contract_month, trade_date);
"""

UPSERT_SEQUENCE_LIBRARY_SQL = """
INSERT INTO sequence_library (
    sequence_type,
    source_name,
    source_id,
    query_term,
    display_name,
    organism,
    sequence,
    sequence_length,
    description,
    record_url,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (sequence_type, source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    display_name = EXCLUDED.display_name,
    organism = EXCLUDED.organism,
    sequence = EXCLUDED.sequence,
    sequence_length = EXCLUDED.sequence_length,
    description = EXCLUDED.description,
    record_url = EXCLUDED.record_url,
    fetched_at = NOW();
"""

UPSERT_KNOWLEDGE_LIBRARY_SQL = """
INSERT INTO knowledge_library (
    record_type,
    source_name,
    source_id,
    query_term,
    title,
    organism,
    summary_text,
    content_text,
    keywords,
    record_url,
    published_at,
    raw_payload,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (record_type, source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    title = EXCLUDED.title,
    organism = EXCLUDED.organism,
    summary_text = EXCLUDED.summary_text,
    content_text = EXCLUDED.content_text,
    keywords = EXCLUDED.keywords,
    record_url = EXCLUDED.record_url,
    published_at = EXCLUDED.published_at,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

UPSERT_SEQUENCING_RUN_LIBRARY_SQL = """
INSERT INTO sequencing_run_library (
    source_name,
    source_id,
    query_term,
    study_accession,
    experiment_accession,
    sample_accession,
    organism,
    library_strategy,
    library_source,
    library_layout,
    instrument_platform,
    instrument_model,
    read_count,
    base_count,
    fastq_bytes,
    published_at,
    ftp_url,
    record_url,
    raw_payload,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    study_accession = EXCLUDED.study_accession,
    experiment_accession = EXCLUDED.experiment_accession,
    sample_accession = EXCLUDED.sample_accession,
    organism = EXCLUDED.organism,
    library_strategy = EXCLUDED.library_strategy,
    library_source = EXCLUDED.library_source,
    library_layout = EXCLUDED.library_layout,
    instrument_platform = EXCLUDED.instrument_platform,
    instrument_model = EXCLUDED.instrument_model,
    read_count = EXCLUDED.read_count,
    base_count = EXCLUDED.base_count,
    fastq_bytes = EXCLUDED.fastq_bytes,
    published_at = EXCLUDED.published_at,
    ftp_url = EXCLUDED.ftp_url,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

UPSERT_MARKET_INSTRUMENTS_SQL = """
INSERT INTO market_instruments (
    asset_type,
    source_name,
    symbol,
    display_name,
    market,
    currency,
    exchange_name,
    reference_url,
    metadata_text,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, symbol)
DO UPDATE SET
    asset_type = EXCLUDED.asset_type,
    display_name = EXCLUDED.display_name,
    market = EXCLUDED.market,
    currency = EXCLUDED.currency,
    exchange_name = EXCLUDED.exchange_name,
    reference_url = EXCLUDED.reference_url,
    metadata_text = EXCLUDED.metadata_text,
    fetched_at = NOW();
"""

UPSERT_MARKET_PRICE_BARS_SQL = """
INSERT INTO market_price_bars (
    source_name,
    symbol,
    asset_type,
    market,
    contract_month,
    trade_date,
    open_price,
    high_price,
    low_price,
    close_price,
    settlement_price,
    volume,
    turnover,
    open_interest,
    change_value,
    raw_payload,
    fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, symbol, contract_month, trade_date)
DO UPDATE SET
    asset_type = EXCLUDED.asset_type,
    market = EXCLUDED.market,
    contract_month = EXCLUDED.contract_month,
    open_price = EXCLUDED.open_price,
    high_price = EXCLUDED.high_price,
    low_price = EXCLUDED.low_price,
    close_price = EXCLUDED.close_price,
    settlement_price = EXCLUDED.settlement_price,
    volume = EXCLUDED.volume,
    turnover = EXCLUDED.turnover,
    open_interest = EXCLUDED.open_interest,
    change_value = EXCLUDED.change_value,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

CREATE_SEQUENCE_LIBRARY_FETCHED_AT_IDX = """
CREATE INDEX IF NOT EXISTS idx_sequence_library_fetched_at
    ON sequence_library (fetched_at DESC);
"""

CREATE_KNOWLEDGE_LIBRARY_FETCHED_AT_IDX = """
CREATE INDEX IF NOT EXISTS idx_knowledge_library_fetched_at
    ON knowledge_library (fetched_at DESC);
"""

CREATE_KNOWLEDGE_LIBRARY_RECORD_TYPE_IDX = """
CREATE INDEX IF NOT EXISTS idx_knowledge_library_record_type
    ON knowledge_library (record_type);
"""

CREATE_SEQUENCING_RUN_LIBRARY_FETCHED_AT_IDX = """
CREATE INDEX IF NOT EXISTS idx_sequencing_run_library_fetched_at
    ON sequencing_run_library (fetched_at DESC);
"""

CREATE_MARKET_PRICE_BARS_TRADE_DATE_IDX = """
CREATE INDEX IF NOT EXISTS idx_market_price_bars_trade_date
    ON market_price_bars (trade_date DESC);
"""

CREATE_MARKET_PRICE_BARS_SYMBOL_IDX = """
CREATE INDEX IF NOT EXISTS idx_market_price_bars_symbol
    ON market_price_bars (symbol);
"""

CORE_SCHEMA_STATEMENTS = (
    CREATE_INQUIRIES_TABLE_SQL,
    CREATE_SEQUENCE_LIBRARY_TABLE_SQL,
    CREATE_KNOWLEDGE_LIBRARY_TABLE_SQL,
    CREATE_SEQUENCING_RUN_LIBRARY_TABLE_SQL,
    CREATE_SEQUENCE_LIBRARY_FETCHED_AT_IDX,
    CREATE_KNOWLEDGE_LIBRARY_FETCHED_AT_IDX,
    CREATE_KNOWLEDGE_LIBRARY_RECORD_TYPE_IDX,
    CREATE_SEQUENCING_RUN_LIBRARY_FETCHED_AT_IDX,
)

MARKET_SCHEMA_STATEMENTS = (
    CREATE_MARKET_INSTRUMENTS_TABLE_SQL,
    CREATE_MARKET_PRICE_BARS_TABLE_SQL,
    ALTER_MARKET_PRICE_BARS_ADD_CONTRACT_MONTH_SQL,
    DROP_LEGACY_MARKET_PRICE_BARS_UNIQUE_SQL,
    CREATE_MARKET_PRICE_BARS_UNIQUE_INDEX_SQL,
    CREATE_MARKET_PRICE_BARS_TRADE_DATE_IDX,
    CREATE_MARKET_PRICE_BARS_SYMBOL_IDX,
)

# ── AlphaFold structure predictions ─────────────────────────────────────────

CREATE_STRUCTURE_PREDICTIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS structure_predictions (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    uniprot_id VARCHAR(32) NOT NULL,
    entry_id VARCHAR(64) NOT NULL DEFAULT '',
    gene_name VARCHAR(120) NOT NULL DEFAULT '',
    organism VARCHAR(160) NOT NULL DEFAULT '',
    confidence_avg DOUBLE PRECISION,
    model_url TEXT NOT NULL DEFAULT '',
    model_page_url TEXT NOT NULL DEFAULT '',
    sequence_length INTEGER,
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, uniprot_id)
);
"""

UPSERT_STRUCTURE_PREDICTION_SQL = """
INSERT INTO structure_predictions (
    source_name, uniprot_id, entry_id, gene_name, organism,
    confidence_avg, model_url, model_page_url, sequence_length,
    raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, uniprot_id)
DO UPDATE SET
    entry_id = EXCLUDED.entry_id,
    gene_name = EXCLUDED.gene_name,
    organism = EXCLUDED.organism,
    confidence_avg = EXCLUDED.confidence_avg,
    model_url = EXCLUDED.model_url,
    model_page_url = EXCLUDED.model_page_url,
    sequence_length = EXCLUDED.sequence_length,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

STRUCTURE_SCHEMA_STATEMENTS = (
    CREATE_STRUCTURE_PREDICTIONS_TABLE_SQL,
)

# ── Clinical variants (ClinVar + COSMIC) ────────────────────────────────────

CREATE_CLINICAL_VARIANT_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS clinical_variant_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    query_term VARCHAR(200) NOT NULL DEFAULT '',
    gene_symbol VARCHAR(32) NOT NULL DEFAULT '',
    variant_name VARCHAR(500) NOT NULL DEFAULT '',
    clinical_significance VARCHAR(120) NOT NULL DEFAULT '',
    condition_names TEXT NOT NULL DEFAULT '',
    review_status VARCHAR(120) NOT NULL DEFAULT '',
    variant_type VARCHAR(64) NOT NULL DEFAULT '',
    chromosome VARCHAR(8) NOT NULL DEFAULT '',
    position VARCHAR(32) NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, source_id)
);
"""

UPSERT_CLINICAL_VARIANT_SQL = """
INSERT INTO clinical_variant_library (
    source_name, source_id, query_term, gene_symbol, variant_name,
    clinical_significance, condition_names, review_status, variant_type,
    chromosome, position, record_url, raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    gene_symbol = EXCLUDED.gene_symbol,
    variant_name = EXCLUDED.variant_name,
    clinical_significance = EXCLUDED.clinical_significance,
    condition_names = EXCLUDED.condition_names,
    review_status = EXCLUDED.review_status,
    variant_type = EXCLUDED.variant_type,
    chromosome = EXCLUDED.chromosome,
    position = EXCLUDED.position,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

VARIANT_SCHEMA_STATEMENTS = (
    CREATE_CLINICAL_VARIANT_LIBRARY_TABLE_SQL,
)

# ── Population allele frequencies (gnomAD) ──────────────────────────────────

CREATE_ALLELE_FREQUENCY_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS allele_frequency_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    variant_id VARCHAR(120) NOT NULL,
    query_term VARCHAR(120) NOT NULL DEFAULT '',
    gene_symbol VARCHAR(32) NOT NULL DEFAULT '',
    consequence VARCHAR(120) NOT NULL DEFAULT '',
    allele_frequency DOUBLE PRECISION,
    homozygote_count INTEGER,
    population_frequencies TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, variant_id)
);
"""

UPSERT_ALLELE_FREQUENCY_SQL = """
INSERT INTO allele_frequency_library (
    source_name, variant_id, query_term, gene_symbol, consequence,
    allele_frequency, homozygote_count, population_frequencies,
    record_url, raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, variant_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    gene_symbol = EXCLUDED.gene_symbol,
    consequence = EXCLUDED.consequence,
    allele_frequency = EXCLUDED.allele_frequency,
    homozygote_count = EXCLUDED.homozygote_count,
    population_frequencies = EXCLUDED.population_frequencies,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

POPULATION_SCHEMA_STATEMENTS = (
    CREATE_ALLELE_FREQUENCY_LIBRARY_TABLE_SQL,
)

# ── Protein interactions (STRING) ───────────────────────────────────────────

CREATE_PROTEIN_INTERACTION_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS protein_interaction_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(120) NOT NULL,
    query_term VARCHAR(200) NOT NULL DEFAULT '',
    protein_a VARCHAR(120) NOT NULL DEFAULT '',
    protein_b VARCHAR(120) NOT NULL DEFAULT '',
    combined_score INTEGER NOT NULL DEFAULT 0,
    experimental_score INTEGER,
    database_score INTEGER,
    textmining_score INTEGER,
    organism_id INTEGER NOT NULL DEFAULT 9606,
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, source_id)
);
"""

UPSERT_PROTEIN_INTERACTION_SQL = """
INSERT INTO protein_interaction_library (
    source_name, source_id, query_term, protein_a, protein_b,
    combined_score, experimental_score, database_score, textmining_score,
    organism_id, record_url, raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    protein_a = EXCLUDED.protein_a,
    protein_b = EXCLUDED.protein_b,
    combined_score = EXCLUDED.combined_score,
    experimental_score = EXCLUDED.experimental_score,
    database_score = EXCLUDED.database_score,
    textmining_score = EXCLUDED.textmining_score,
    organism_id = EXCLUDED.organism_id,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

INTERACTION_SCHEMA_STATEMENTS = (
    CREATE_PROTEIN_INTERACTION_LIBRARY_TABLE_SQL,
)

# ── Economic indicators (FRED) ──────────────────────────────────────────────

CREATE_ECONOMIC_INDICATOR_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS economic_indicator_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    series_id VARCHAR(32) NOT NULL,
    observation_date DATE NOT NULL,
    value DOUBLE PRECISION,
    title VARCHAR(500) NOT NULL DEFAULT '',
    frequency VARCHAR(32) NOT NULL DEFAULT '',
    units VARCHAR(120) NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, series_id, observation_date)
);
"""

UPSERT_ECONOMIC_INDICATOR_SQL = """
INSERT INTO economic_indicator_library (
    source_name, series_id, observation_date, value,
    title, frequency, units, raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, series_id, observation_date)
DO UPDATE SET
    value = EXCLUDED.value,
    title = EXCLUDED.title,
    frequency = EXCLUDED.frequency,
    units = EXCLUDED.units,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

ECONOMIC_SCHEMA_STATEMENTS = (
    CREATE_ECONOMIC_INDICATOR_LIBRARY_TABLE_SQL,
)

# ── OpenTargets gene-disease associations ───────────────────────────────────

CREATE_OPENTARGETS_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS opentargets_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(120) NOT NULL,
    query_term VARCHAR(120) NOT NULL DEFAULT '',
    target_id VARCHAR(32) NOT NULL DEFAULT '',
    target_symbol VARCHAR(32) NOT NULL DEFAULT '',
    disease_id VARCHAR(64) NOT NULL DEFAULT '',
    disease_name VARCHAR(500) NOT NULL DEFAULT '',
    overall_score DOUBLE PRECISION,
    datatype_scores TEXT NOT NULL DEFAULT '',
    drug_names TEXT NOT NULL DEFAULT '',
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, source_id)
);
"""

UPSERT_OPENTARGETS_SQL = """
INSERT INTO opentargets_library (
    source_name, source_id, query_term, target_id, target_symbol,
    disease_id, disease_name, overall_score, datatype_scores,
    drug_names, record_url, raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    target_symbol = EXCLUDED.target_symbol,
    disease_name = EXCLUDED.disease_name,
    overall_score = EXCLUDED.overall_score,
    datatype_scores = EXCLUDED.datatype_scores,
    drug_names = EXCLUDED.drug_names,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

OPENTARGETS_SCHEMA_STATEMENTS = (
    CREATE_OPENTARGETS_LIBRARY_TABLE_SQL,
)

# ── ChEMBL compound-bioactivity ─────────────────────────────────────────────

CREATE_CHEMBL_LIBRARY_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS chembl_library (
    id BIGSERIAL PRIMARY KEY,
    source_name VARCHAR(32) NOT NULL,
    source_id VARCHAR(120) NOT NULL,
    query_term VARCHAR(120) NOT NULL DEFAULT '',
    molecule_name VARCHAR(500) NOT NULL DEFAULT '',
    molecule_chembl_id VARCHAR(32) NOT NULL DEFAULT '',
    target_chembl_id VARCHAR(32) NOT NULL DEFAULT '',
    target_name VARCHAR(500) NOT NULL DEFAULT '',
    mechanism_of_action TEXT NOT NULL DEFAULT '',
    activity_type VARCHAR(64) NOT NULL DEFAULT '',
    activity_value DOUBLE PRECISION,
    activity_units VARCHAR(32) NOT NULL DEFAULT '',
    max_phase INTEGER,
    record_url TEXT NOT NULL DEFAULT '',
    raw_payload TEXT NOT NULL DEFAULT '',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_name, source_id)
);
"""

UPSERT_CHEMBL_SQL = """
INSERT INTO chembl_library (
    source_name, source_id, query_term, molecule_name, molecule_chembl_id,
    target_chembl_id, target_name, mechanism_of_action, activity_type,
    activity_value, activity_units, max_phase, record_url, raw_payload, fetched_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
ON CONFLICT (source_name, source_id)
DO UPDATE SET
    query_term = EXCLUDED.query_term,
    molecule_name = EXCLUDED.molecule_name,
    target_name = EXCLUDED.target_name,
    mechanism_of_action = EXCLUDED.mechanism_of_action,
    activity_type = EXCLUDED.activity_type,
    activity_value = EXCLUDED.activity_value,
    activity_units = EXCLUDED.activity_units,
    max_phase = EXCLUDED.max_phase,
    record_url = EXCLUDED.record_url,
    raw_payload = EXCLUDED.raw_payload,
    fetched_at = NOW();
"""

CHEMBL_SCHEMA_STATEMENTS = (
    CREATE_CHEMBL_LIBRARY_TABLE_SQL,
)

# ── pgvector embedding support for RAG ──────────────────────────────────────

ENABLE_PGVECTOR_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;
"""

ALTER_KNOWLEDGE_ADD_EMBEDDING_SQL = """
ALTER TABLE knowledge_library
ADD COLUMN IF NOT EXISTS embedding vector(384);
"""

CREATE_KNOWLEDGE_EMBEDDING_IDX = """
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
    ON knowledge_library USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
"""

PGVECTOR_SCHEMA_STATEMENTS = (
    ENABLE_PGVECTOR_SQL,
    ALTER_KNOWLEDGE_ADD_EMBEDDING_SQL,
    CREATE_KNOWLEDGE_EMBEDDING_IDX,
)
