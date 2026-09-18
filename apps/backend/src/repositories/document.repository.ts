import { db } from '../utils/db';
import { Document, ProcessingResult } from '../types/document.types';

export class DocumentRepository {
  /**
   * Save a new document record.
   */
  static async createDocument(doc: Document): Promise<Document> {
    const query = `
      INSERT INTO documents (document_name, document_type, storage_path)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [doc.document_name, doc.document_type, doc.storage_path];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Create a new processing result for a document.
   */
  static async createProcessingResult(result: ProcessingResult): Promise<ProcessingResult> {
    const query = `
      INSERT INTO processing_results (
        document_id,
        processing_attempt,
        document_type,
        extracted_measure,
        measure_date,
        status,
        confidence_score,
        error_code,
        error_message,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `;
    const values = [
      result.document_id,
      result.processing_attempt || 1,
      result.document_type,
      result.extracted_measure,
      result.measure_date,
      result.status,
      result.confidence_score,
      result.error_code,
      result.error_message,
      result.processed_at || new Date()
    ];
    const res = await db.query(query, values);
    return res.rows[0];
  }

  /**
   * Fetch all documents with their latest processing result.
   */
  static async getAllDocumentsWithLatestResult(): Promise<any[]> {
    const query = `
      SELECT 
        d.id as document_id, d.document_name, d.storage_path, d.uploaded_at,
        pr.id as result_id, pr.status, pr.extracted_measure, pr.measure_date, pr.document_type as result_type, pr.error_message
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT * FROM processing_results
        WHERE document_id = d.id
        ORDER BY processed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) pr ON true
      ORDER BY d.uploaded_at DESC;
    `;
    const result = await db.query(query);
    return result.rows;
  }
}
