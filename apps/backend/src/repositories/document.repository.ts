/**
 * ──────────────────────────────────────────────────────────────
 * DOCUMENT REPOSITORY  (document.repository.ts)
 * ──────────────────────────────────────────────────────────────
 * Handles all raw SQL queries for documents and processing_results.
 * No business logic lives here — only data access.
 *
 * WHY A REPOSITORY PATTERN?
 *   Separates "how we store data" from "what we do with it".
 *   In Phase 2, this is the only layer that changes when we
 *   switch from local PostgreSQL to Azure Database for PostgreSQL.
 * ──────────────────────────────────────────────────────────────
 */

import { db } from '../utils/db';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DocumentRecord {
  id?:            string;
  document_name:  string;
  document_type?: string | null;
  storage_path:   string;
  processed_by?:  string | null;
  uploaded_at?:   Date;
  created_at?:    Date;
  updated_at?:    Date;
}

export interface ProcessingResultRecord {
  id?:                string;
  document_id:        string;
  processing_attempt?: number;
  document_type?:     string | null;
  extracted_measure?: string | null;
  measure_date?:      Date | null;
  status:             'PROCESSING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED';
  confidence_score?:  number | null;
  error_code?:        string | null;
  error_message?:     string | null;
  processed_at?:      Date | null;
  correlation_id?:    string | null;
  created_at?:        Date;
}

// ─── Repository ───────────────────────────────────────────────────────────

export class DocumentRepository {

  /** Insert a new document record. */
  static async createDocument(doc: DocumentRecord): Promise<DocumentRecord> {
    const result = await db.query(
      `INSERT INTO documents (document_name, storage_path, processed_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [doc.document_name, doc.storage_path, doc.processed_by ?? null]
    );
    return result.rows[0];
  }

  /** Fetch a single document by ID (needed for retry). */
  static async getDocumentById(id: string): Promise<DocumentRecord | null> {
    const result = await db.query(
      `SELECT * FROM documents WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Delete a document — CASCADE removes all linked processing_results via FK. */
  static async deleteDocument(id: string): Promise<void> {
    await db.query(`DELETE FROM documents WHERE id = $1`, [id]);
  }

  /** Create a new processing_results row (initial PROCESSING state). */
  static async createProcessingResult(
    data: Pick<ProcessingResultRecord, 'document_id' | 'processing_attempt' | 'status' | 'correlation_id'>
  ): Promise<ProcessingResultRecord> {
    const result = await db.query(
      `INSERT INTO processing_results
         (document_id, processing_attempt, status, correlation_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        data.document_id,
        data.processing_attempt ?? 1,
        data.status,
        data.correlation_id ?? null,
      ]
    );
    return result.rows[0];
  }

  /** Update an existing processing_results row with the final outcome. */
  static async updateProcessingResult(
    id: string,
    updates: Partial<Omit<ProcessingResultRecord, 'id' | 'document_id' | 'processing_attempt' | 'correlation_id' | 'created_at'>>
  ): Promise<ProcessingResultRecord> {
    const result = await db.query(
      `UPDATE processing_results SET
         document_type     = $1,
         extracted_measure = $2,
         measure_date      = $3,
         status            = $4,
         confidence_score  = $5,
         error_code        = $6,
         error_message     = $7,
         processed_at      = $8
       WHERE id = $9
       RETURNING *`,
      [
        updates.document_type     ?? null,
        updates.extracted_measure ?? null,
        updates.measure_date      ?? null,
        updates.status,
        updates.confidence_score  ?? null,
        updates.error_code        ?? null,
        updates.error_message     ?? null,
        updates.processed_at      ?? new Date(),
        id,
      ]
    );
    return result.rows[0];
  }

  /**
   * Get the highest attempt number for a given document.
   * Returns 0 if no results exist yet.
   */
  static async getLatestAttemptNumber(documentId: string): Promise<number> {
    const result = await db.query(
      `SELECT COALESCE(MAX(processing_attempt), 0) as max_attempt
       FROM processing_results
       WHERE document_id = $1`,
      [documentId]
    );
    return parseInt(result.rows[0]?.max_attempt ?? '0', 10);
  }

  /**
   * Fetch all documents with their most recent processing result.
   * Uses a LATERAL join to efficiently get the latest result per document.
   * Returns columns needed by the frontend dashboard.
   */
  static async getAllDocumentsWithLatestResult(): Promise<any[]> {
    const result = await db.query(
      `SELECT
         d.id              AS document_id,
         d.document_name,
         d.storage_path,
         d.processed_by,
         d.uploaded_at,
         pr.id             AS result_id,
         pr.status,
         pr.document_type  AS result_type,
         pr.extracted_measure,
         pr.measure_date,
         pr.confidence_score,
         pr.processing_attempt,
         pr.error_code,
         pr.error_message,
         pr.processed_at,
         pr.correlation_id
       FROM documents d
       LEFT JOIN LATERAL (
         SELECT *
         FROM   processing_results
         WHERE  document_id = d.id
         ORDER  BY processing_attempt DESC, created_at DESC
         LIMIT  1
       ) pr ON true
       ORDER BY d.uploaded_at DESC`
    );
    return result.rows;
  }
}
