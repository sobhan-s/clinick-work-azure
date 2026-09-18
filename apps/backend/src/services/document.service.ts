/**
 * ──────────────────────────────────────────────────────────────
 * DOCUMENT SERVICE  (document.service.ts)
 * ──────────────────────────────────────────────────────────────
 * Orchestrates the document processing workflow.
 *
 * Workflow:
 *   1. Save file to local disk (simulates Blob Storage)
 *   2. Create documents record in PostgreSQL
 *   3. Create PROCESSING result record (initial state)
 *   4. Call AiService → extract raw clinical candidates
 *   5. Call rules.engine → apply business rules → ProcessingDecision
 *   6. Update the processing_results record with final outcome
 *
 * RETRY:
 *   Retry fetches the existing document record (gets storage path),
 *   increments the attempt number, and runs steps 3–6 again.
 *   The failed record is NOT deleted — all attempts are preserved.
 * ──────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DocumentRepository } from '../repositories/document.repository';
import { AiService } from './ai.service';
import { applyBusinessRules } from './rules.engine';

// ─── Helpers ──────────────────────────────────────────────────────────────

function ensureUploadDir(): string {
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class DocumentService {

  /**
   * Full upload-and-process workflow for a new document.
   */
  static async processDocument(
    fileName: string,
    fileBuffer: Buffer,
    processedBy: string = 'System'
  ): Promise<any> {
    const correlationId = uuidv4();
    const label = `[DocService][${correlationId}]`;

    console.log(`${label} Starting upload for: "${fileName}", processedBy: ${processedBy}`);

    // ── 1. Save file to disk ─────────────────────────────────────────────
    const uploadDir = ensureUploadDir();
    const storedFileName = `${uuidv4()}-${fileName}`;
    const storagePath = path.join(uploadDir, storedFileName);
    fs.writeFileSync(storagePath, fileBuffer);
    console.log(`${label} File saved to: ${storagePath}`);

    // ── 2. Create document record ─────────────────────────────────────────
    const document = await DocumentRepository.createDocument({
      document_name: fileName,
      storage_path:  storagePath,
      processed_by:  processedBy,
    });
    console.log(`${label} Document record created: ${document.id}`);

    // ── 3. Create initial PROCESSING result ──────────────────────────────
    const processingResult = await DocumentRepository.createProcessingResult({
      document_id:        document.id!,
      processing_attempt: 1,
      status:             'PROCESSING',
      correlation_id:     correlationId,
    });

    // ── 4 & 5. AI extraction + Rules engine ──────────────────────────────
    const decision = await DocumentService._runProcessingPipeline(
      document.id!,
      storagePath,
      fileName,
      1,
      correlationId
    );

    // ── 6. Update processing result with final decision ───────────────────
    const finalResult = await DocumentRepository.updateProcessingResult(processingResult.id!, {
      document_type:    decision.documentType,
      extracted_measure: decision.extractedMeasure,
      measure_date:     decision.measureDate,
      status:           decision.status,
      confidence_score: decision.confidenceScore,
      error_code:       decision.errorCode,
      error_message:    decision.errorMessage,
      processed_at:     new Date(),
    });

    console.log(`${label} Processing complete → ${decision.status} (confidence: ${decision.confidenceScore})`);

    return { document, result: finalResult, correlationId };
  }

  /**
   * Retry a previously failed or needs-review document.
   * Fetches the existing document record, increments the attempt number,
   * and runs the full extraction + rules pipeline again.
   */
  static async retryDocument(documentId: string): Promise<any> {
    const correlationId = uuidv4();
    const label = `[DocService:Retry][${correlationId}]`;

    // Fetch existing document
    const document = await DocumentRepository.getDocumentById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Check the file still exists on disk
    if (!fs.existsSync(document.storage_path)) {
      throw new Error(
        `Original file no longer exists at ${document.storage_path}. Cannot retry.`
      );
    }

    // Get latest attempt number and increment
    const latestAttempt = await DocumentRepository.getLatestAttemptNumber(documentId);
    const nextAttempt = latestAttempt + 1;

    console.log(`${label} Retrying document ${documentId}, attempt #${nextAttempt}`);

    // Create a new PROCESSING result for this attempt
    const processingResult = await DocumentRepository.createProcessingResult({
      document_id:        documentId,
      processing_attempt: nextAttempt,
      status:             'PROCESSING',
      correlation_id:     correlationId,
    });

    // Run the pipeline again
    const decision = await DocumentService._runProcessingPipeline(
      documentId,
      document.storage_path,
      document.document_name,
      nextAttempt,
      correlationId
    );

    const finalResult = await DocumentRepository.updateProcessingResult(processingResult.id!, {
      document_type:    decision.documentType,
      extracted_measure: decision.extractedMeasure,
      measure_date:     decision.measureDate,
      status:           decision.status,
      confidence_score: decision.confidenceScore,
      error_code:       decision.errorCode,
      error_message:    decision.errorMessage,
      processed_at:     new Date(),
    });

    console.log(`${label} Retry complete → ${decision.status}`);
    return { document, result: finalResult, correlationId };
  }

  /**
   * Core pipeline: AI extraction → clinical rules → decision.
   * Used by both processDocument() and retryDocument().
   * Returns a ProcessingDecision (never throws — failures are caught and
   * returned as a FAILED decision so the DB record is always updated).
   */
  private static async _runProcessingPipeline(
    documentId:    string,
    storagePath:   string,
    fileName:      string,
    attempt:       number,
    correlationId: string
  ) {
    const label = `[Pipeline][${correlationId}]`;

    try {
      // ── AI Extraction ─────────────────────────────────────────────────
      const extraction = await AiService.extractFromDocument(storagePath, fileName, correlationId);

      // ── Business Rules ────────────────────────────────────────────────
      const decision = applyBusinessRules(extraction, fileName, correlationId);

      return decision;

    } catch (error: any) {
      console.error(`${label} Pipeline error on attempt ${attempt}:`, error.message);

      return {
        documentType:     null,
        extractedMeasure: null,
        measureDate:      null,
        status:           'FAILED' as const,
        confidenceScore:  0,
        errorCode:        'PIPELINE_ERROR',
        errorMessage:     cleanErrorMessage(error.message ?? 'Unknown processing error'),
      };
    }
  }

  /**
   * Fetch all documents with their latest processing result.
   */
  static async getAllDocuments(): Promise<any[]> {
    return DocumentRepository.getAllDocumentsWithLatestResult();
  }

  /**
   * Delete a document and all its processing results.
   */
  static async deleteDocument(documentId: string): Promise<void> {
    const document = await DocumentRepository.getDocumentById(documentId);
    if (!document) throw new Error(`Document not found: ${documentId}`);

    // Delete from DB (CASCADE removes processing_results too)
    await DocumentRepository.deleteDocument(documentId);

    // Best-effort: remove file from disk
    try {
      if (fs.existsSync(document.storage_path)) {
        fs.unlinkSync(document.storage_path);
      }
    } catch {
      // Non-fatal — DB record is deleted, file cleanup is best-effort
    }
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────
/**
 * Strip raw JSON blobs from Groq/API error messages so users see
 * a clean, human-readable description instead of:
 *   "404 {"error":{"message":"The model..."}}"
 */
function cleanErrorMessage(raw: string): string {
  try {
    // Try to extract the JSON part and get the human message inside
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const msg = parsed?.error?.message ?? parsed?.message;
      if (msg && typeof msg === 'string') return msg;
    }
  } catch {
    // Not parseable — fall through
  }
  // Truncate at 120 chars to avoid overwhelming the UI
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}
