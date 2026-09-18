export type ProcessingStatus = 'PROCESSING' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED';

export interface Document {
  id?: string;
  document_name: string;
  document_type?: string | null;
  storage_path: string;
  uploaded_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface ProcessingResult {
  id?: string;
  document_id: string;
  processing_attempt?: number;
  document_type?: string | null;
  extracted_measure?: string | null;
  measure_date?: Date | null;
  status: ProcessingStatus;
  confidence_score?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  processed_at?: Date | null;
  created_at?: Date;
}
