export interface RawReading {
  type: 'BP' | 'A1C' | 'UNKNOWN';
  value: string; // e.g. "120/80" or "6.1"
  date: string | null; // ISO date string or null
  context: string; // e.g. "goal", "historical", "current"
  patient_age?: number | null;
}

export interface AiExtractionResult {
  document_type: 'BP' | 'A1C' | 'UNKNOWN';
  readings: RawReading[];
  patient_age: number | null;
}
