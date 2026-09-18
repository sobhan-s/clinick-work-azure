import { DocumentRepository } from '../repositories/document.repository';
import { AiService } from './ai.service';
import { ClinicalService } from './clinical.service';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DocumentService {
  /**
   * Main workflow for processing a new uploaded document.
   */
  static async processDocument(
    fileName: string,
    fileBuffer: Buffer,
    processedBy: string
  ): Promise<any> {
    
    // Simulate blob storage by saving file to a temporary 'uploads' directory locally
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const storagePath = path.join(uploadDir, `${uuidv4()}-${fileName}`);
    fs.writeFileSync(storagePath, fileBuffer);

    // 1. Save initial document to PostgreSQL
    const document = await DocumentRepository.createDocument({
      document_name: fileName,
      storage_path: storagePath,
    });

    if (!document.id) {
      throw new Error("Failed to create document record.");
    }

    // 2. Insert initial "PROCESSING" result
    await DocumentRepository.createProcessingResult({
      document_id: document.id,
      status: 'PROCESSING',
      processing_attempt: 1,
    });

    try {
      // 3. Call AI Service (Gemini) to extract data
      const aiResult = await AiService.extractDocumentData(storagePath);
      
      if (!aiResult) {
        // AI extraction totally failed
        const failedResult = await DocumentRepository.createProcessingResult({
          document_id: document.id,
          status: 'FAILED',
          processing_attempt: 1,
          error_code: 'AI_EXTRACTION_ERROR',
          error_message: 'Failed to extract data using AI.',
        });
        return { document, result: failedResult };
      }

      // 4. Apply Clinical Business Rules
      const clinicalResult = ClinicalService.processClinicalData(document.id, aiResult);

      // 5. Save final result
      const finalResult = await DocumentRepository.createProcessingResult({
        ...clinicalResult,
        document_id: document.id,
        processing_attempt: 1, // Same attempt, overriding the PROCESSING state essentially by creating a new recent record
      } as any);

      return { document, result: finalResult };

    } catch (error: any) {
      // Catch-all for unexpected processing errors
      const errorResult = await DocumentRepository.createProcessingResult({
        document_id: document.id,
        status: 'FAILED',
        processing_attempt: 1,
        error_code: 'INTERNAL_ERROR',
        error_message: error.message || 'Unknown processing error',
      });
      return { document, result: errorResult };
    }
  }

  static async getAllDocuments() {
    return DocumentRepository.getAllDocumentsWithLatestResult();
  }

  static async retryDocument(documentId: string): Promise<any> {
    // Note: To implement retry properly, we would fetch the document's storage_path,
    // ensure it's not currently PROCESSING, and re-run the processDocument workflow.
    // We will keep this simple for the PoC.
    throw new Error('Retry not fully implemented in local service yet.');
  }
}
