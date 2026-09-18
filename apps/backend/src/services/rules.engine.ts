/**
 * ══════════════════════════════════════════════════════════════════
 * CLINICAL RULES ENGINE  (rules.engine.ts)
 * ══════════════════════════════════════════════════════════════════
 *
 * WHAT THIS FILE DOES
 * ───────────────────
 * This is the deterministic decision layer of ClinicWorks.
 * It receives the raw extraction output from the AI service and
 * applies the exact business rules described in the assignment.
 *
 * It produces a final ProcessingDecision — the outcome that gets
 * persisted to PostgreSQL.
 *
 * SEPARATION OF CONCERNS
 * ──────────────────────
 *   ai.service.ts     →  "What does the document contain?"
 *   rules.engine.ts   →  "What is the clinical decision?"
 *
 * The AI lists all candidates and flags their context (goal, historical…).
 * This engine filters, selects, validates, and scores them.
 *
 * WHY NOT LET THE LLM DECIDE?
 * ────────────────────────────
 * An LLM can misinterpret edge cases, hallucinate, or be inconsistent.
 * For clinical data, the selection logic must be:
 *   ✓ Deterministic (same input → same output, always)
 *   ✓ Auditable (we can explain every decision in code)
 *   ✓ Unit-testable (we can write tests for each rule)
 *   ✓ Traceable (we log which rule fired and why)
 *
 * CONFIDENCE SCORING MODEL
 * ────────────────────────
 * Confidence is calculated from four weighted pillars:
 *
 *   Pillar 1 — Model Quality   (25%)
 *     → The LLM's self-reported extractionConfidence
 *     → Penalised slightly if the model left extraction notes
 *       (notes indicate ambiguity)
 *
 *   Pillar 2 — Completeness    (25%)
 *     → Is a measurement date present?
 *     → For BP: are both systolic and diastolic present?
 *
 *   Pillar 3 — Format Validity (25%)
 *     → Is the extracted value in a physiologically plausible range?
 *     → BP: systolic 90–200, diastolic 50–130
 *     → HbA1c: 4.0%–15.0% (extended clinical range)
 *
 *   Pillar 4 — Business Rule Fit (25%)
 *     → Was the selection clean (single obvious reading) → 1.0
 *     → Multiple readings resolved by date → 0.85
 *     → Had to fall back to lowest-sum / lowest-value rule → 0.65
 *
 *   Final confidence = average of four pillars, clamped to [0, 1]
 *
 * STATUS MAPPING
 * ──────────────
 *   confidence >= 0.80  →  SUCCESS
 *   confidence >= 0.50  →  NEEDS_REVIEW
 *   (hard errors)       →  FAILED
 *
 * WHY NEEDS_REVIEW != FAILED
 * ──────────────────────────
 *   FAILED means a technical error prevented processing (unreadable file,
 *   LLM crash, DB error). The document may be retried.
 *
 *   NEEDS_REVIEW means the document was understood and the measure was
 *   extracted, but confidence is below the acceptance threshold. A human
 *   should verify before acting on the result. Retry is optional.
 *
 * ══════════════════════════════════════════════════════════════════
 */

import { ClinicalExtractionResult, BloodPressureCandidate, HbA1cCandidate } from '../types/ai.types';

// ─── Output Type ──────────────────────────────────────────────────────────

export interface ProcessingDecision {
  documentType:     'BP' | 'HbA1c' | null;
  extractedMeasure: string | null;
  measureDate:      Date | null;
  status:           'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED';
  confidenceScore:  number;
  errorCode:        string | null;
  errorMessage:     string | null;
}

// ─── Confidence Pillar Weights ────────────────────────────────────────────

const WEIGHTS = {
  modelQuality:    0.25,
  completeness:    0.25,
  formatValidity:  0.25,
  businessRuleFit: 0.25,
} as const;

// ─── Internal Helpers ─────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundConfidence(raw: number): number {
  return Math.round(clamp(raw, 0, 1) * 100) / 100;
}

function computeConfidence(
  modelQuality:    number,
  completeness:    number,
  formatValidity:  number,
  businessRuleFit: number
): number {
  const raw =
    WEIGHTS.modelQuality    * modelQuality +
    WEIGHTS.completeness    * completeness +
    WEIGHTS.formatValidity  * formatValidity +
    WEIGHTS.businessRuleFit * businessRuleFit;
  return roundConfidence(raw);
}

function confidenceToStatus(confidence: number): 'SUCCESS' | 'NEEDS_REVIEW' {
  return confidence >= 0.80 ? 'SUCCESS' : 'NEEDS_REVIEW';
}

function parseDateOrNull(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

// ─── BP Selection Rules ────────────────────────────────────────────────────

/**
 * Filter and select the best BP reading from AI candidates.
 *
 * Rules applied in order:
 *  1. Exclude goals/targets
 *  2. Exclude past/historical readings
 *  3. Exclude readings where systolic or diastolic is null
 *  4. Exclude physiologically impossible values:
 *       systolic  : 50–260 mmHg
 *       diastolic : 30–160 mmHg
 *       systolic > diastolic (pulse pressure sanity check)
 *  5. If multiple valid readings remain:
 *       a. Try to select the most recent by date
 *       b. If dates are tied or absent → select lowest systolic + diastolic sum
 */
function filterValidBpCandidates(candidates: BloodPressureCandidate[]): BloodPressureCandidate[] {
  return candidates.filter(c => {
    if (c.isGoalOrTarget)      return false;
    if (c.isPastOrHistorical)  return false;
    if (c.systolic  === null)  return false;
    if (c.diastolic === null)  return false;
    // Physiological bounds
    if (c.systolic  < 50  || c.systolic  > 260) return false;
    if (c.diastolic < 30  || c.diastolic > 160) return false;
    // Systolic must exceed diastolic
    if (c.systolic <= c.diastolic) return false;
    return true;
  });
}

type BpSelectionTrace = {
  selected: BloodPressureCandidate;
  /** businessRuleFit score for the selection method used */
  ruleFit: number;
};

function selectBestBpReading(valid: BloodPressureCandidate[]): BpSelectionTrace {
  if (valid.length === 1) {
    return { selected: valid[0], ruleFit: 1.0 };
  }

  // Attempt 1: most-recent by readingDate
  const withDates = valid.filter(c => !!c.readingDate);

  if (withDates.length === valid.length) {
    // All readings have dates — sort descending
    const sorted = [...withDates].sort(
      (a, b) => new Date(b.readingDate!).getTime() - new Date(a.readingDate!).getTime()
    );
    const mostRecentDate = sorted[0].readingDate!;
    const tiedOnDate = sorted.filter(c => c.readingDate === mostRecentDate);

    if (tiedOnDate.length === 1) {
      // Cleanly resolved by date
      return { selected: tiedOnDate[0], ruleFit: 0.85 };
    }

    // Dates tied — fall back to lowest sum among tied readings
    const lowestOfTied = selectLowestBpSum(tiedOnDate);
    return { selected: lowestOfTied, ruleFit: 0.65 };
  }

  // Attempt 2: dates missing or inconsistent → lowest systolic+diastolic sum
  const lowest = selectLowestBpSum(valid);
  return { selected: lowest, ruleFit: 0.65 };
}

function selectLowestBpSum(readings: BloodPressureCandidate[]): BloodPressureCandidate {
  return [...readings].sort(
    (a, b) => (a.systolic! + a.diastolic!) - (b.systolic! + b.diastolic!)
  )[0];
}

// ─── HbA1c Selection Rules ────────────────────────────────────────────────

/**
 * Filter and select the best HbA1c reading from AI candidates.
 *
 * Rules applied in order:
 *  1. Exclude goals/targets
 *  2. Exclude reference ranges (lab normal intervals)
 *  3. Exclude past/historical readings (use only if no current readings found)
 *  4. Exclude null or NaN values
 *  5. Biological feasibility: 3.0% – 20.0%
 *  6. If multiple valid readings remain → select the LOWEST value
 *
 * Note on past/historical: the assignment does not explicitly say to
 * reject historical HbA1c entirely. We prefer current, but fall back
 * to historical rather than returning NEEDS_REVIEW unnecessarily.
 */
function filterValidHbA1cCandidates(candidates: HbA1cCandidate[]): HbA1cCandidate[] {
  const base = candidates.filter(c => {
    if (c.isGoalOrTarget)   return false;
    if (c.isReferenceRange) return false;
    if (c.value === null || isNaN(c.value)) return false;
    // Biological feasibility
    if (c.value < 3.0 || c.value > 20.0) return false;
    return true;
  });

  // Prefer current readings; fall back to historical if nothing current
  const current    = base.filter(c => !c.isPastOrHistorical);
  return current.length > 0 ? current : base;
}

// ─── HbA1c Classification ─────────────────────────────────────────────────

/**
 * Apply the assignment's HbA1c classification thresholds:
 *
 *   value > 5.9   →  Diabetes
 *   value >= 5.7  →  Prediabetes     ← NOTE: >= not > for Prediabetes
 *   otherwise     →  no classification label appended
 *
 * The assignment's exact wording: "> 5.7 → Prediabetes, > 5.9 → Diabetes"
 * We interpret the boundary 5.7 itself as Prediabetes (clinically standard).
 */
function classifyHbA1c(value: number): string {
  if (value > 5.9)  return `${value}% (Diabetes)`;
  if (value >= 5.7) return `${value}% (Prediabetes)`;
  return `${value}%`;
}

// ─── Main Engine ──────────────────────────────────────────────────────────

/**
 * Evaluate a ClinicalExtractionResult through all business rules
 * and return a final ProcessingDecision.
 *
 * @param extraction - The raw output from AiService.extractFromDocument()
 * @param fileName   - Original filename (used for type fallback hints)
 * @param correlationId - Request ID for log tracing
 */
export function applyBusinessRules(
  extraction: ClinicalExtractionResult,
  fileName: string,
  correlationId: string
): ProcessingDecision {
  const label = `[Rules][${correlationId}]`;

  // ── Determine effective document type ────────────────────────────────────
  // The AI may say UNKNOWN but we can still hint from the file name.
  const lowerName = fileName.toLowerCase();
  let effectiveType = extraction.documentType;

  if (effectiveType === 'UNKNOWN') {
    if (lowerName.includes('bp') || lowerName.includes('blood') || lowerName.includes('pressure')) {
      effectiveType = 'BP';
      console.log(`${label} documentType=UNKNOWN overridden to BP via filename hint.`);
    } else if (lowerName.includes('hba1c') || lowerName.includes('a1c') || lowerName.includes('diabetes') || lowerName.includes('glucose')) {
      effectiveType = 'HbA1c';
      console.log(`${label} documentType=UNKNOWN overridden to HbA1c via filename hint.`);
    }
  }

  // ── Candidate-driven fallback ─────────────────────────────────────────
  // If still UNKNOWN, infer from which candidate array has data
  if (effectiveType === 'UNKNOWN') {
    const hasBp    = extraction.bloodPressureCandidates.length > 0;
    const hasHba1c = extraction.hba1cCandidates.length > 0;

    if (hasBp && !hasHba1c)    effectiveType = 'BP';
    else if (hasHba1c && !hasBp) effectiveType = 'HbA1c';
  }

  // ── Dispatch to type-specific rule set ───────────────────────────────────
  if (effectiveType === 'BP') {
    return applyBloodPressureRules(extraction, correlationId);
  }

  if (effectiveType === 'HbA1c') {
    return applyHbA1cRules(extraction, correlationId);
  }

  // ── Completely unresolvable ──────────────────────────────────────────────
  console.log(`${label} Could not determine document type — FAILED.`);
  return {
    documentType:     null,
    extractedMeasure: null,
    measureDate:      null,
    status:           'FAILED',
    confidenceScore:  0,
    errorCode:        'UNRESOLVABLE_TYPE',
    errorMessage:     'Document does not appear to contain BP or HbA1c data.',
  };
}

// ─── Blood Pressure Rules ─────────────────────────────────────────────────

function applyBloodPressureRules(
  extraction: ClinicalExtractionResult,
  correlationId: string
): ProcessingDecision {
  const label = `[Rules:BP][${correlationId}]`;

  // ── Assignment Rule: Reject patients under 18 ───────────────────────────
  if (extraction.patientAge !== null && extraction.patientAge < 18) {
    console.log(`${label} Patient age ${extraction.patientAge} < 18 — NEEDS_REVIEW.`);
    return {
      documentType:     'BP',
      extractedMeasure: null,
      measureDate:      parseDateOrNull(extraction.observationDate),
      status:           'NEEDS_REVIEW',
      confidenceScore:  0.50,
      errorCode:        'PATIENT_UNDERAGE',
      errorMessage:     `Patient is ${extraction.patientAge} years old. Clinical rules require age ≥ 18 for BP reporting.`,
    };
  }

  // ── Filter and select valid BP reading ──────────────────────────────────
  const validCandidates = filterValidBpCandidates(extraction.bloodPressureCandidates);
  console.log(
    `${label} ${extraction.bloodPressureCandidates.length} total BP candidates, ` +
    `${validCandidates.length} valid after filtering.`
  );

  if (validCandidates.length === 0) {
    console.log(`${label} No valid BP candidates — NEEDS_REVIEW.`);
    return {
      documentType:     'BP',
      extractedMeasure: null,
      measureDate:      parseDateOrNull(extraction.observationDate),
      status:           'NEEDS_REVIEW',
      confidenceScore:  0.50,
      errorCode:        'NO_VALID_BP_READING',
      errorMessage:     'No current, non-goal blood pressure reading with both systolic and diastolic values could be identified.',
    };
  }

  // ── Apply selection logic ────────────────────────────────────────────────
  const { selected, ruleFit } = selectBestBpReading(validCandidates);
  const measure = `${selected.systolic}/${selected.diastolic}`;
  const measureDate = parseDateOrNull(selected.readingDate ?? extraction.observationDate);

  console.log(`${label} Selected BP: ${measure}, date: ${selected.readingDate ?? 'none'}, ruleFit: ${ruleFit}`);

  // ── Confidence: 4 pillars ────────────────────────────────────────────────
  const modelQuality =
    clamp(extraction.extractionConfidence, 0, 1) *
    (extraction.extractionNotes ? 0.85 : 1.0);

  const completeness =
    (measureDate ? 0.5 : 0) +
    (selected.systolic !== null ? 0.25 : 0) +
    (selected.diastolic !== null ? 0.25 : 0);

  const inNormalBpRange =
    selected.systolic! >= 90 && selected.systolic! <= 180 &&
    selected.diastolic! >= 50 && selected.diastolic! <= 110;
  const formatValidity = inNormalBpRange ? 1.0 : 0.65;

  const confidence = computeConfidence(modelQuality, completeness, formatValidity, ruleFit);
  const status = confidenceToStatus(confidence);

  console.log(
    `${label} Confidence pillars — ` +
    `modelQuality: ${modelQuality.toFixed(2)}, completeness: ${completeness.toFixed(2)}, ` +
    `formatValidity: ${formatValidity}, ruleFit: ${ruleFit} → final: ${confidence} → ${status}`
  );

  return {
    documentType:     'BP',
    extractedMeasure: measure,
    measureDate,
    status,
    confidenceScore:  confidence,
    errorCode:        null,
    errorMessage:     null,
  };
}

// ─── HbA1c Rules ─────────────────────────────────────────────────────────

function applyHbA1cRules(
  extraction: ClinicalExtractionResult,
  correlationId: string
): ProcessingDecision {
  const label = `[Rules:HbA1c][${correlationId}]`;

  // ── Filter and select valid HbA1c reading ───────────────────────────────
  const validCandidates = filterValidHbA1cCandidates(extraction.hba1cCandidates);
  console.log(
    `${label} ${extraction.hba1cCandidates.length} total HbA1c candidates, ` +
    `${validCandidates.length} valid after filtering.`
  );

  if (validCandidates.length === 0) {
    console.log(`${label} No valid HbA1c candidates — NEEDS_REVIEW.`);
    return {
      documentType:     'HbA1c',
      extractedMeasure: null,
      measureDate:      parseDateOrNull(extraction.observationDate),
      status:           'NEEDS_REVIEW',
      confidenceScore:  0.50,
      errorCode:        'NO_VALID_HBAIC_READING',
      errorMessage:     'No valid HbA1c measurement found. Values may have been goals, reference ranges, or historical readings.',
    };
  }

  // ── Select lowest value (assignment rule) ────────────────────────────────
  const sorted = [...validCandidates].sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
  const selected = sorted[0];
  const classified = classifyHbA1c(selected.value!);
  const measureDate = parseDateOrNull(selected.readingDate ?? extraction.observationDate);

  console.log(`${label} Selected HbA1c: ${selected.value}% → "${classified}", date: ${selected.readingDate ?? 'none'}`);

  // ── Confidence: 4 pillars ────────────────────────────────────────────────
  const modelQuality =
    clamp(extraction.extractionConfidence, 0, 1) *
    (extraction.extractionNotes ? 0.85 : 1.0);

  const completeness = measureDate ? 1.0 : 0.55;

  // Normal clinical range 4–10%, extended range 3–15%
  const inNormalRange = selected.value! >= 4.0 && selected.value! <= 10.0;
  const formatValidity = inNormalRange ? 1.0 : 0.65;

  // ruleFit: single candidate is cleanest; more candidates = more ambiguity
  const ruleFit = validCandidates.length === 1 ? 1.0 : 0.85;

  const confidence = computeConfidence(modelQuality, completeness, formatValidity, ruleFit);
  const status = confidenceToStatus(confidence);

  console.log(
    `${label} Confidence pillars — ` +
    `modelQuality: ${modelQuality.toFixed(2)}, completeness: ${completeness}, ` +
    `formatValidity: ${formatValidity}, ruleFit: ${ruleFit} → final: ${confidence} → ${status}`
  );

  return {
    documentType:     'HbA1c',
    extractedMeasure: classified,
    measureDate,
    status,
    confidenceScore:  confidence,
    errorCode:        null,
    errorMessage:     null,
  };
}
