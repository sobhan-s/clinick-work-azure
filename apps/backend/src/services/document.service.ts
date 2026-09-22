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
import { containerClient } from '../utils/blob';

// ─── Service ──────────────────────────────────────────────────────────────

export class DocumentService {

  /**
   * Upload file to blob storage and create initial database records.
   * Processing is handled asynchronously by Azure Logic Apps -> Functions.
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

    console.log(`${label} Upload complete. Document queued for processing via Logic App.`);

    return { document, result: processingResult, correlationId };
  }

  /**
   * Retry a previously failed or needs-review document.
   * Increments the attempt number and sets status back to PROCESSING.
   * Note: You would typically trigger the Azure Function HTTP endpoint here, 
   * or re-upload the blob to trigger the Logic App again.
   */
  static async retryDocument(documentId: string): Promise<any> {
    const correlationId = uuidv4();
    const label = `[DocService:Retry][${correlationId}]`;

    // Fetch existing document
    const document = await DocumentRepository.getDocumentById(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Get latest attempt number and increment
    const latestAttempt = await DocumentRepository.getLatestAttemptNumber(documentId);
    const nextAttempt = latestAttempt + 1;

    console.log(`${label} Queuing retry for document ${documentId}, attempt #${nextAttempt}`);

    // Create a new PROCESSING result for this attempt
    const processingResult = await DocumentRepository.createProcessingResult({
      document_id:        documentId,
      processing_attempt: nextAttempt,
      status:             'PROCESSING',
      correlation_id:     correlationId,
    });

    // Trigger Azure Function HTTP endpoint directly via fetch to start retry
    const azureFunctionUrl = process.env.AZURE_FUNCTION_URL || "https://func-clinicworks-docprocessor-dev-ci-bpa9edera7azbccr.centralindia-01.azurewebsites.net/api/process-document";
    try {
      await fetch(azureFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobName: document.storage_path })
      });
      console.log(`${label} Triggered Azure Function for retry via HTTP`);
    } catch (err: any) {
      console.error(`${label} Failed to trigger Azure Function retry:`, err.message);
    }

    return { document, result: processingResult, correlationId };
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
    }
  }
}

