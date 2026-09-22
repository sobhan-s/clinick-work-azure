import { app, InvocationContext, HttpRequest, HttpResponseInit } from '@azure/functions';
import { downloadBlobToBuffer } from '../services/storage.service';
import { AiService } from '../services/ai.service';
import { applyBusinessRules } from '../services/rules.engine';
import { 
  getDocumentById, 
  getDocumentByBlobName, 
  getLatestProcessingResultId, 
  updateProcessingResult 
} from '../services/db.service';

/**
 * Core processing routine for a single document.
 */
export async function processDocumentInternal(
  documentId: string,
  blobName: string,
  fileName: string,
  correlationId: string,
  context?: InvocationContext
) {
  context?.log(`[processDocument] Starting processing for document ID: ${documentId} (${fileName})`);

  // Find the latest processing result ID for this document to update
  const processingResultId = await getLatestProcessingResultId(documentId);
  if (!processingResultId) {
    throw new Error(`No PROCESSING result found for document ${documentId}`);
  }

  try {
    context?.log(`[processDocument] Downloading blob: ${blobName}`);
    const pdfBuffer = await downloadBlobToBuffer(blobName);

    context?.log(`[processDocument] Extracting clinical measurements for "${fileName}"`);
    // AiService requires blobName and fileName in the current implementation
    const extraction = await AiService.extractFromDocument(blobName, fileName, correlationId);

    context?.log(`[processDocument] Applying business rules...`);
    const decision = applyBusinessRules(extraction, fileName, correlationId);

    context?.log(
      `[processDocument] Decision: type=${decision.documentType}, measure=${decision.extractedMeasure}, status=${decision.status}`
    );

    const updatedResult = await updateProcessingResult(processingResultId, {
      document_type: decision.documentType,
      extracted_measure: decision.extractedMeasure,
      measure_date: decision.measureDate,
      status: decision.status,
      confidence_score: decision.confidenceScore,
      error_code: decision.errorCode,
      error_message: decision.errorMessage,
    });

    context?.log(`[processDocument] Successfully completed processing for document ${documentId}`);
    return updatedResult;
  } catch (err) {
    const errorMessage = (err as Error).message;
    context?.error(`[processDocument] Processing failed for document ${documentId}:`, errorMessage);
    
    // Update the DB with the failure
    await updateProcessingResult(processingResultId, {
      document_type: null,
      extracted_measure: null,
      measure_date: null,
      status: 'FAILED',
      confidence_score: null,
      error_code: 'PIPELINE_ERROR',
      error_message: errorMessage.length > 120 ? errorMessage.slice(0, 117) + '...' : errorMessage,
    });
    
    throw err;
  }
}

/**
 * HTTP Trigger (Called by Logic App)
 */
app.http('processDocument', {
  methods: ['POST'],
  authLevel: 'anonymous', // Logic app will call this
  route: 'process-document',
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    let docId: string | undefined;
    let blobName: string | undefined;
    
    const correlationId = request.headers.get('x-correlation-id') || `func-${Date.now()}`;

    try {
      const body = (await request.json()) as { documentId?: string; blobName?: string };

      docId = body.documentId;
      blobName = body.blobName;

      // If only blobName is provided (typical from Logic App Event Grid trigger)
      if (!docId && blobName) {
        // Just extract the filename from the blob path if it has a folder
        const cleanBlobName = blobName.split('/').pop() || blobName;
        const doc = await getDocumentByBlobName(cleanBlobName);
        if (doc) {
          docId = doc.id;
        }
      }

      if (!docId) {
        return {
          status: 400,
          jsonBody: { error: 'Please provide a valid documentId or blobName in JSON request body that corresponds to a DB record.' },
        };
      }

      // We need the document record to get fileName and blobName if not provided
      const documentRecord = await getDocumentById(docId);
      if (!documentRecord) {
        return {
          status: 404,
          jsonBody: { error: `Document ${docId} not found in database.` },
        };
      }

      const actualBlobName = documentRecord.storage_path;
      const fileName = documentRecord.document_name;

      const result = await processDocumentInternal(docId, actualBlobName, fileName, correlationId, context);

      return {
        status: 200,
        jsonBody: {
          status: 'success',
          result,
        },
      };
    } catch (err) {
      context.error('[HTTP Trigger Error]:', err);
      return {
        status: 500,
        jsonBody: {
          status: 'error',
          message: (err as Error).message,
        },
      };
    }
  },
});
