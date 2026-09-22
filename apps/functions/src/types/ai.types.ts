/**
 * ──────────────────────────────────────────────────────────────
 * AI EXTRACTION TYPES  (ai.types.ts)
 * ──────────────────────────────────────────────────────────────
 * These types define the strict contract between:
 *   → The Groq AI extraction layer  (ai.service.ts)
 *   → The clinical rules engine     (rules.engine.ts)
 *
 * WHY separate BP and HbA1c candidate objects?
 *   Because the two clinical measures have completely different
 *   validation semantics.  A single generic "reading" object
 *   cannot capture that HbA1c has "isReferenceRange" while BP
 *   needs systolic/diastolic as separate numbers.
 *
 * WHY boolean flags instead of a free-form context string?
 *   The original design used context: "goal" | "historical" etc.
 *   That relies on the LLM exactly matching a word we check.
 *   Boolean flags force the model to make a structured decision;
 *   they are easier to validate and impossible to misspell.
 * ──────────────────────────────────────────────────────────────
 */

/**
 * A single blood pressure observation found in the document.
 * The AI identifies each reading separately so the rules engine
 * can apply selection logic (most-recent / lowest-sum).
 */
export interface BloodPressureCandidate {
  /** Systolic value in mmHg — null if model could not parse */
  systolic: number | null;
  /** Diastolic value in mmHg — null if model could not parse */
  diastolic: number | null;
  /** ISO YYYY-MM-DD date of this specific reading, or null */
  readingDate: string | null;
  /** True when document marks this as "goal", "target", "recommended" */
  isGoalOrTarget: boolean;
  /** True when marked as "previous", "prior", "historical", "baseline" */
  isPastOrHistorical: boolean;
  /** Raw surrounding text snippet — useful for debugging extraction */
  rawSnippet: string;
}

/**
 * A single HbA1c / A1C observation found in the document.
 * HbA1c adds isReferenceRange to differentiate lab normal-ranges
 * (e.g. "< 5.7% Normal") from actual patient measurements.
 */
export interface HbA1cCandidate {
  /** Numeric HbA1c percentage value, e.g. 6.8 — null if unparsable */
  value: number | null;
  /** ISO YYYY-MM-DD date of this specific reading, or null */
  readingDate: string | null;
  /** True when marked as "goal" or "target" value */
  isGoalOrTarget: boolean;
  /** True when this is a lab reference interval, e.g. "< 5.7% Normal" */
  isReferenceRange: boolean;
  /** True when marked as historical, previous, or past */
  isPastOrHistorical: boolean;
  /** Raw surrounding text snippet */
  rawSnippet: string;
}

/**
 * The complete structured extraction result returned by Groq.
 * This is the AI's interpretation only — no business rules applied yet.
 * The rules engine (rules.engine.ts) consumes this object.
 */
export interface ClinicalExtractionResult {
  /** Primary document type as classified by the model */
  documentType: 'BP' | 'HbA1c' | 'UNKNOWN';
  /** Patient age in years, or null if not mentioned in document */
  patientAge: number | null;
  /** Date of Birth in YYYY-MM-DD — used to compute age if age absent */
  patientDob: string | null;
  /** Primary document observation date (Date of Service, Collection Date) */
  observationDate: string | null;
  /** All blood pressure candidates found — may include goals, historical etc. */
  bloodPressureCandidates: BloodPressureCandidate[];
  /** All HbA1c candidates found — may include reference ranges, goals etc. */
  hba1cCandidates: HbA1cCandidate[];
  /**
   * Self-reported extraction confidence 0.0–1.0.
   * High = text was clear and unambiguous.
   * Low  = model had to guess or text was unclear/scanned.
   */
  extractionConfidence: number;
  /** Optional model notes about ambiguity or missing data */
  extractionNotes: string | null;
}
