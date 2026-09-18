CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_name TEXT NOT NULL,
    document_type TEXT,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processing_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL
        REFERENCES documents(id)
        ON DELETE CASCADE,
    processing_attempt INTEGER NOT NULL DEFAULT 1,
    document_type TEXT,
    extracted_measure TEXT,
    measure_date DATE,
    status TEXT NOT NULL,
    confidence_score NUMERIC(5,4),
    error_code TEXT,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT processing_status_check
        CHECK (
            status IN (
                'PROCESSING',
                'SUCCESS',
                'NEEDS_REVIEW',
                'FAILED'
            )
        ),
    CONSTRAINT confidence_score_check
        CHECK (
            confidence_score IS NULL
            OR (
                confidence_score >= 0
                AND confidence_score <= 1
            )
        ),
    CONSTRAINT attempt_positive_check
        CHECK (processing_attempt > 0)
);

CREATE INDEX IF NOT EXISTS idx_processing_results_document_id
    ON processing_results(document_id);

CREATE INDEX IF NOT EXISTS idx_processing_results_status
    ON processing_results(status);

CREATE INDEX IF NOT EXISTS idx_processing_results_processed_at
    ON processing_results(processed_at DESC);
