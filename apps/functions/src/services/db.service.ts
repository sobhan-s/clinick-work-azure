import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
};

export async function getDocumentById(id: string) {
  const result = await db.query(`SELECT * FROM documents WHERE id = $1`, [id]);
  return result.rows[0];
}

export async function getDocumentByBlobName(blobName: string) {
  const result = await db.query(`SELECT * FROM documents WHERE storage_path = $1`, [blobName]);
  return result.rows[0];
}

export async function getLatestProcessingResultId(documentId: string) {
  const result = await db.query(
    `SELECT id FROM processing_results WHERE document_id = $1 ORDER BY processing_attempt DESC LIMIT 1`,
    [documentId]
  );
  return result.rows[0]?.id;
}

export async function updateProcessingResult(
  id: string,
  updates: {
    document_type: string | null;
    extracted_measure: string | null;
    measure_date: Date | null;
    status: string;
    confidence_score: number | null;
    error_code: string | null;
    error_message: string | null;
  }
) {
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
      updates.document_type,
      updates.extracted_measure,
      updates.measure_date,
      updates.status,
      updates.confidence_score,
      updates.error_code,
      updates.error_message,
      new Date(),
      id,
    ]
  );
  return result.rows[0];
}
