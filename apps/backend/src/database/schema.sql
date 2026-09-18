-- ClinicWorks — PostgreSQL Schema
-- Run via: npm run db:init  (from apps/backend)
--
-- Design decisions:
--   documents           → one row per uploaded file
--   processing_results  → one row per processing ATTEMPT
--                         (retry creates a new row, does NOT overwrite)
--
-- This means we have a full audit trail: every attempt is visible.
-- The dashboard shows only the LATEST attempt via a LATERAL join.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Documents ────────────────────────────────────────────────────────────
-- Stores metadata about uploaded clinical PDF files.
-- storage_path points to the local disk location (Phase 2: Blob Storage URL).

CREATE TABLE IF NOT EXISTS documents (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_name TEXT         NOT NULL,
    document_type TEXT,                          -- Optional pre-classification
    storage_path  TEXT         NOT NULL,         -- Local path (Phase 2: blob URL)
    processed_by  TEXT,                          -- "User", or username in future
    uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Processing Results ───────────────────────────────────────────────────
-- One row per processing attempt.
-- processing_attempt = 1 for initial, 2 for first retry, etc.
-- correlation_id links DB records to log lines for tracing.

CREATE TABLE IF NOT EXISTS processing_results (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id        UUID         NOT NULL
                                    REFERENCES documents(id)
                                    ON DELETE CASCADE,
    processing_attempt INTEGER      NOT NULL DEFAULT 1,
    document_type      TEXT,                      -- 'BP' | 'HbA1c' | null
    extracted_measure  TEXT,                      -- e.g. "138/88" or "6.8% (Prediabetes)"
    measure_date       DATE,                      -- Date of the clinical measurement
    status             TEXT         NOT NULL,     -- PROCESSING | SUCCESS | NEEDS_REVIEW | FAILED
    confidence_score   NUMERIC(5,4),              -- 4-pillar score 0.0000–1.0000
    error_code         TEXT,                      -- Machine-readable error code
    error_message      TEXT,                      -- Human-readable error description
    correlation_id     UUID,                      -- Ties DB record to log lines
    processed_at       TIMESTAMPTZ,               -- When processing completed
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT processing_status_check CHECK (
        status IN ('PROCESSING', 'SUCCESS', 'NEEDS_REVIEW', 'FAILED')
    ),
    CONSTRAINT confidence_range_check CHECK (
        confidence_score IS NULL
        OR (confidence_score >= 0 AND confidence_score <= 1)
    ),
    CONSTRAINT attempt_positive_check CHECK (processing_attempt > 0)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────
-- idx on document_id — used in every LATERAL join to get latest result
CREATE INDEX IF NOT EXISTS idx_pr_document_id
    ON processing_results(document_id);

-- idx on status — useful for "show all FAILED" queries / monitoring
CREATE INDEX IF NOT EXISTS idx_pr_status
    ON processing_results(status);

-- idx on processing_attempt DESC — used in LATERAL join ORDER BY
CREATE INDEX IF NOT EXISTS idx_pr_attempt_desc
    ON processing_results(document_id, processing_attempt DESC);
