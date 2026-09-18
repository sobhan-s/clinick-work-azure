/**
 * ──────────────────────────────────────────────────────────────
 * AI EXTRACTION SERVICE  (ai.service.ts)
 * ──────────────────────────────────────────────────────────────
 * RESPONSIBILITY:
 *   Extract raw clinical candidates from document text using the
 *   Groq LLM API.  This service deliberately does NO business-rule
 *   evaluation — it only asks the model to identify what is there.
 *
 * ARCHITECTURE DECISION — why separate AI extraction from rules?
 *   The LLM is good at reading and parsing natural-language text.
 *   It is NOT reliable as a clinical decision-maker.  If we ask
 *   "what is the correct BP?", the model may guess.  Instead we ask
 *   "list every BP you see and flag context", then our deterministic
 *   rules engine makes the actual selection decision.
 *
 *   AI layer  →  structured candidates
 *   Rules engine  →  business decision
 *
 * GROQ MODEL CHOICE — llama-3.3-70b-versatile
 *   Valid Groq model with strong instruction-following.
 *   Supports JSON mode (response_format: json_object).
 *   In Phase 2, this can be swapped for Azure OpenAI.
 *
 * TEXT EXTRACTION:
 *   We use pdf2json for text-based PDFs.
 *   If extracted text is too short (likely a scanned image PDF),
 *   we surface a meaningful error rather than silently sending
 *   garbage to the LLM.  Full OCR is a Phase 1 Stage 7 addition.
 * ──────────────────────────────────────────────────────────────
 */

import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ClinicalExtractionResult } from '../types/ai.types';

const PDFParser = require('pdf2json');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ─── Minimum character threshold to consider a PDF "text-based" ───────────
const MIN_TEXT_LENGTH = 80;

// ─── Groq model — must be a real model ID from https://console.groq.com ───
const GROQ_MODEL = 'openai/gpt-oss-120b';

// ─── The JSON schema we enforce in the Groq response ──────────────────────
// Groq's json_object mode ensures the response parses cleanly.
// We describe the full structure in the system prompt so the model knows
// exactly what fields to produce.
const SYSTEM_PROMPT = `
You are ClinicWorks — a precision clinical document extraction engine.
Your job is to read a clinical medical record and extract ALL observations
in a strict JSON format. You do NOT apply clinical rules or select a "best"
reading. You extract every observation you find and flag its context.

You MUST return a JSON object with these exact fields:

{
  "documentType": "BP" | "HbA1c" | "UNKNOWN",
  "patientAge": <number or null>,
  "patientDob": "<YYYY-MM-DD or null>",
  "observationDate": "<YYYY-MM-DD or null>",
  "bloodPressureCandidates": [
    {
      "systolic": <number or null>,
      "diastolic": <number or null>,
      "readingDate": "<YYYY-MM-DD or null>",
      "isGoalOrTarget": <true if this reading is a goal/target/recommended threshold>,
      "isPastOrHistorical": <true if marked as prior/previous/historical/baseline>,
      "rawSnippet": "<the exact surrounding text>"
    }
  ],
  "hba1cCandidates": [
    {
      "value": <numeric percentage e.g. 6.8, or null>,
      "readingDate": "<YYYY-MM-DD or null>",
      "isGoalOrTarget": <true if goal or target>,
      "isReferenceRange": <true if this is a lab normal range like "< 5.7% Normal">,
      "isPastOrHistorical": <true if prior or historical>,
      "rawSnippet": "<exact surrounding text>"
    }
  ],
  "extractionConfidence": <0.0 to 1.0 — how clearly the document communicates the data>,
  "extractionNotes": "<any ambiguity, unclear values, or assumptions — or null>"
}

Rules:
- documentType: classify as "BP" if the primary subject is blood pressure,
  "HbA1c" if it is glycated hemoglobin / A1C, "UNKNOWN" if neither.
- patientAge: extract in years. If only DOB is given and an observation date
  exists, calculate the age. Otherwise null.
- observationDate: this is the Date of Service, Collection Date, or Exam Date —
  NOT the patient's date of birth.
- For BP: extract systolic and diastolic as separate integers.
  Never combine numbers that are not from the same reading.
- For HbA1c: extract the numeric % value. Strip the % symbol.
  Laboratory reference intervals (e.g. "< 5.7 Normal range") must be
  marked isReferenceRange: true.
- extractionConfidence: 1.0 = perfectly clear text. 0.5 = ambiguous or partial.
  0.1 = barely readable or very unclear.
- Do NOT hallucinate. If a value is absent, use null.
- Do NOT apply any clinical decision logic — just extract and flag.
`.trim();

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract raw text from a PDF file using pdf2json.
 * Returns null if the file is not readable or too short (scanned PDF).
 */
async function extractTextFromPdf(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const pdfParser = new PDFParser(null, 1); // 1 = raw text mode

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      console.error(`[AI Service] pdf2json error: ${errData.parserError}`);
      resolve(null);
    });

    pdfParser.on('pdfParser_dataReady', () => {
      const text = pdfParser.getRawTextContent();
      if (!text || text.trim().length < MIN_TEXT_LENGTH) {
        // Text too short — likely a scanned/image PDF.
        // In Stage 7 this will trigger OCR; for now we surface the issue.
        resolve(null);
      } else {
        resolve(text);
      }
    });

    pdfParser.loadPDF(filePath);
  });
}

/**
 * Initialise Groq client lazily so the server boots even if the API key is
 * missing (the error surfaces only when a document is actually processed).
 */
function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is not set in environment variables. ' +
      'Add it to your .env file before processing documents.'
    );
  }
  return new Groq({ apiKey });
}

// ─── Main Export ──────────────────────────────────────────────────────────

export class AiService {
  /**
   * Extract structured clinical candidates from a PDF file.
   *
   * Flow:
   *   1. Read and decode PDF text from disk
   *   2. Check minimum text length (guard against image PDFs)
   *   3. Build extraction prompt with document text + filename hint
   *   4. Call Groq with json_object mode
   *   5. Parse and return typed ClinicalExtractionResult
   *
   * This method NEVER applies clinical rules.
   * All rule decisions happen in rules.engine.ts.
   *
   * Throws on:
   *   - Missing GROQ_API_KEY
   *   - Unreadable / empty PDF (scanned image)
   *   - Groq API error
   *   - Unparseable JSON response
   */
  static async extractFromDocument(
    filePath: string,
    fileName: string,
    correlationId: string
  ): Promise<ClinicalExtractionResult> {
    const label = `[AI][${correlationId}]`;

    // ── Step 1: Extract text from PDF ─────────────────────────────────────
    console.log(`${label} Extracting text from PDF: ${fileName}`);
    const documentText = await extractTextFromPdf(filePath);

    if (!documentText) {
      throw new Error(
        `Unable to extract readable text from "${fileName}". ` +
        'This may be a scanned or image-based PDF. ' +
        'OCR support is planned for Stage 7.'
      );
    }

    console.log(`${label} Extracted ${documentText.length} characters of text.`);

    // ── Step 2: Build user prompt ─────────────────────────────────────────
    // We include the file name as a hint — e.g. "bp_report_2024.pdf" helps
    // the model lean toward BP classification in ambiguous cases.
    const userContent =
      `File name: "${fileName}"\n\n` +
      `Document text:\n"""\n${documentText.slice(0, 14000)}\n"""`;

    // ── Step 3: Call Groq ─────────────────────────────────────────────────
    const groq = getGroqClient();

    console.log(`${label} Sending to Groq (model: ${GROQ_MODEL})...`);

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0,          // Deterministic — no creativity needed here
      max_tokens: 2048,
      response_format: { type: 'json_object' },  // Forces valid JSON output
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    // ── Step 4: Parse response ────────────────────────────────────────────
    const rawJson = completion.choices[0]?.message?.content;
    if (!rawJson) {
      throw new Error(`${label} Groq returned an empty completion response.`);
    }

    let parsed: ClinicalExtractionResult;
    try {
      parsed = JSON.parse(rawJson) as ClinicalExtractionResult;
    } catch (parseErr) {
      throw new Error(
        `${label} Groq response was not valid JSON. Raw response:\n${rawJson}`
      );
    }

    console.log(
      `${label} Extraction complete. ` +
      `Type: ${parsed.documentType}, ` +
      `BP candidates: ${parsed.bloodPressureCandidates?.length ?? 0}, ` +
      `HbA1c candidates: ${parsed.hba1cCandidates?.length ?? 0}, ` +
      `Confidence: ${parsed.extractionConfidence}`
    );

    if (parsed.extractionNotes) {
      console.log(`${label} Model notes: "${parsed.extractionNotes}"`);
    }

    return parsed;
  }
}
