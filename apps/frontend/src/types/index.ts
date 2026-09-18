// ─── Frontend Types ────────────────────────────────────────────
// These match the shape returned by GET /api/documents
// (DocumentRepository.getAllDocumentsWithLatestResult)

export interface ProcessedDocument {
  document_id:        string;
  document_name:      string;
  storage_path:       string;
  processed_by:       string | null;
  uploaded_at:        string;         // ISO datetime string from DB
  result_id:          string | null;
  status:             'PROCESSING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED' | null;
  result_type:        'BP' | 'HbA1c' | null;
  extracted_measure:  string | null;
  measure_date:       string | null;
  confidence_score:   number | null;  // 0.0 – 1.0
  processing_attempt: number | null;
  error_code:         string | null;
  error_message:      string | null;
  processed_at:       string | null;
  correlation_id:     string | null;
}

export interface ApiResponse<T> {
  status:    'success' | 'error';
  documents?: ProcessedDocument[];
  document?:  T;
  processing_result?: T;
  message?:  string;
}
