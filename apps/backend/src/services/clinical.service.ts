import { AiExtractionResult, RawReading } from '../types/ai.types';
import { ProcessingResult, ProcessingStatus } from '../types/document.types';

export class ClinicalService {
  /**
   * Applies business rules to the raw AI extraction data to compute the final processing result.
   */
  static processClinicalData(
    documentId: string,
    rawResult: AiExtractionResult
  ): Partial<ProcessingResult> {
    
    // Baseline Confidence:
    // Started at 1.0. 
    // -0.2 if document type is UNKNOWN
    // -0.1 if patient age is missing (for BP)
    // -0.2 if no valid readings are found
    let confidence = 1.0;

    if (rawResult.document_type === 'UNKNOWN') {
      return {
        document_id: documentId,
        status: 'FAILED',
        error_code: 'UNKNOWN_TYPE',
        error_message: 'Could not determine if document is BP or A1C.',
        confidence_score: 0.8
      };
    }

    if (rawResult.document_type === 'BP') {
      return this.processBPRules(documentId, rawResult, confidence);
    } else if (rawResult.document_type === 'A1C') {
      return this.processA1CRules(documentId, rawResult, confidence);
    }

    return {
      document_id: documentId,
      status: 'FAILED',
      error_message: 'Unhandled document type.',
      confidence_score: 0.0
    };
  }

  private static processBPRules(documentId: string, rawResult: AiExtractionResult, baseConfidence: number): Partial<ProcessingResult> {
    let confidence = baseConfidence;
    
    // Rule: Do not return a BP result for a patient under age 18.
    if (rawResult.patient_age !== null && rawResult.patient_age < 18) {
      return {
        document_id: documentId,
        status: 'NEEDS_REVIEW',
        error_code: 'UNDERAGE',
        error_message: 'Patient is under 18 years old.',
        confidence_score: confidence
      };
    }
    if (rawResult.patient_age === null) {
      confidence -= 0.1; // Missing age reduces confidence
    }

    // Filter valid readings
    const validReadings = rawResult.readings.filter(r => {
      // Must be BP type
      if (r.type !== 'BP') return false;
      // Exclude goal, target, past, previous (must be current)
      if (['goal', 'target', 'past', 'previous', 'historical', 'reference range'].includes(r.context.toLowerCase())) return false;
      // Must contain systolic and diastolic (format: 120/80)
      if (!r.value.includes('/')) return false;
      
      const parts = r.value.split('/');
      if (parts.length !== 2) return false;
      if (isNaN(parseInt(parts[0])) || isNaN(parseInt(parts[1]))) return false;

      return true;
    });

    if (validReadings.length === 0) {
      return {
        document_id: documentId,
        status: 'NEEDS_REVIEW',
        error_code: 'NO_VALID_READINGS',
        error_message: 'Could not reliably identify a valid current BP reading.',
        confidence_score: Math.max(0, confidence - 0.2)
      };
    }

    // Select the best reading based on rules
    let selectedReading: RawReading = validReadings[0];

    if (validReadings.length > 1) {
      // Try to find the most recent
      const readingsWithDates = validReadings.filter(r => r.date);
      if (readingsWithDates.length > 0) {
        // Sort descending by date
        readingsWithDates.sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
        selectedReading = readingsWithDates[0];
      } else {
        // Most recent cannot be determined, lowest BP based on sys + dia
        selectedReading = validReadings.reduce((lowest, current) => {
          const lSys = parseInt(lowest.value.split('/')[0]);
          const lDia = parseInt(lowest.value.split('/')[1]);
          const cSys = parseInt(current.value.split('/')[0]);
          const cDia = parseInt(current.value.split('/')[1]);
          
          return (cSys + cDia < lSys + lDia) ? current : lowest;
        });
        confidence -= 0.1; // Reduced confidence because we had to guess the lowest instead of latest
      }
    }

    return {
      document_id: documentId,
      document_type: 'BP',
      extracted_measure: selectedReading.value,
      measure_date: selectedReading.date ? new Date(selectedReading.date) : null,
      status: 'SUCCESS',
      confidence_score: confidence
    };
  }

  private static processA1CRules(documentId: string, rawResult: AiExtractionResult, baseConfidence: number): Partial<ProcessingResult> {
    let confidence = baseConfidence;

    // Filter valid readings
    const validReadings = rawResult.readings.filter(r => {
      if (r.type !== 'A1C') return false;
      // Exclude goal, target, historical, reference range
      if (['goal', 'target', 'past', 'previous', 'historical', 'reference range'].includes(r.context.toLowerCase())) return false;
      if (isNaN(parseFloat(r.value))) return false;
      return true;
    });

    if (validReadings.length === 0) {
      return {
        document_id: documentId,
        status: 'NEEDS_REVIEW',
        error_code: 'NO_VALID_READINGS',
        error_message: 'Could not reliably identify a valid current A1C reading.',
        confidence_score: Math.max(0, confidence - 0.2)
      };
    }

    let selectedReading: RawReading = validReadings[0];

    if (validReadings.length > 1) {
      // Rule: If multiple valid A1C values exist, return the lowest value.
      selectedReading = validReadings.reduce((lowest, current) => {
        return (parseFloat(current.value) < parseFloat(lowest.value)) ? current : lowest;
      });
      confidence -= 0.1; // Reduced confidence due to multiple conflicting readings
    }

    const a1cValue = parseFloat(selectedReading.value);
    let finalValue = selectedReading.value;

    // Rule: above 5.9 -> Diabetes, above 5.7 -> Prediabetes
    if (a1cValue > 5.9) {
      finalValue = `${finalValue} (Diabetes)`;
    } else if (a1cValue > 5.7) {
      finalValue = `${finalValue} (Prediabetes)`;
    }

    return {
      document_id: documentId,
      document_type: 'A1C',
      extracted_measure: finalValue,
      measure_date: selectedReading.date ? new Date(selectedReading.date) : null,
      status: 'SUCCESS',
      confidence_score: confidence
    };
  }
}
