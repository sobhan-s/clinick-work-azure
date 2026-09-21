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

import { v4 as uuidv4 } from 'uuid';
import { DocumentRepository } from '../repositories/document.repository';
import { AiService } from './ai.service';
import { applyBusinessRules } from './rules.engine';
import { containerClient } from '../utils/blob';

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

    // ── 1. Upload file to Azure Blob Storage ─────────────────────────────
    const storedFileName = `${uuidv4()}-${fileName}`;
    console.log(`${label} Uploading to Blob Storage: ${storedFileName}`);
    const blockBlobClient = containerClient.getBlockBlobClient(storedFileName);
    await blockBlobClient.uploadData(fileBuffer);

    // ── 2. Create document record ─────────────────────────────────────────
    const document = await DocumentRepository.createDocument({
      document_name: fileName,
      storage_path:  storedFileName,
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
      storedFileName,
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

    // Check the file still exists in Blob Storage
    const blobClient = containerClient.getBlockBlobClient(document.storage_path);
    if (!(await blobClient.exists())) {
      throw new Error(
        `Original file no longer exists in Blob Storage at ${document.storage_path}. Cannot retry.`
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
    blobName:      string,
    fileName:      string,
    attempt:       number,
    correlationId: string
  ) {
    const label = `[Pipeline][${correlationId}]`;

    try {
      // ── AI Extraction ─────────────────────────────────────────────────
      const extraction = await AiService.extractFromDocument(blobName, fileName, correlationId);

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

    // Best-effort: remove file from Blob Storage
    try {
      const blobClient = containerClient.getBlockBlobClient(document.storage_path);
      await blobClient.deleteIfExists();
    } catch (err: any) {
      console.error(`Failed to delete blob ${document.storage_path}:`, err.message);
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
