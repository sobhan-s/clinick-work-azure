export interface ProcessedDocument {
  document_id: string;
  document_name: string;
  storage_path: string;
  uploaded_at: string;
  result_id: string | null;
  status: 'PROCESSING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED' | null;
  extracted_measure: string | null;
  measure_date: string | null;
  result_type: string | null;
  error_message: string | null;
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  message?: string;
  documents?: T[];
  document?: T;
  processing_result?: any;
}
