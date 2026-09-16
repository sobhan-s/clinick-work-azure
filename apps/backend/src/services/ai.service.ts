import Groq from 'groq-sdk';
import { AiExtractionResult } from '../types/ai.types';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
const pdfParse = require('pdf-parse');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Removed top-level Groq instantiation to prevent server crash on boot if .env is missing

export class AiService {
  /**
   * Extracts data from a PDF document using Groq API and an OSS Model.
   */
  static async extractDocumentData(filePath: string): Promise<AiExtractionResult | null> {
    try {
      // Initialize inside the method so we can catch errors gracefully if the key is missing
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      
      // 1. Read and parse the PDF text locally (since Groq standard endpoints don't accept raw PDFs)
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      const documentText = pdfData.text;

      const prompt = `
        You are a highly skilled clinical document processor. Analyze the following clinical document text.
        
        1. Determine the primary document type: "BP" (Blood Pressure) or "A1C" (Hemoglobin A1c). If it's neither, return "UNKNOWN".
        2. Identify the patient's age if present.
        3. Extract all valid readings of the identified type. For each reading, provide:
           - type: "BP" or "A1C"
           - value: The exact value found (e.g. "138/88" for BP, "7.4" for A1C). Strip out units like mmHg or %.
           - date: The date associated with the reading in YYYY-MM-DD format. If none, return null.
           - context: The context of the reading. If it says "goal", "target", "past", "previous", "historical", or "reference range", put that exact word. Otherwise, put "current".

        Return ONLY a JSON object matching this schema. Do NOT wrap it in markdown block quotes.
        {
          "document_type": "BP" | "A1C" | "UNKNOWN",
          "patient_age": number | null,
          "readings": [
            {
              "type": "BP" | "A1C",
              "value": "string",
              "date": "YYYY-MM-DD" | null,
              "context": "string"
            }
          ]
        }
        
        Document Text:
        """
        ${documentText.slice(0, 15000)}
        """
      `;

      // 2. Send the text to Groq for JSON extraction
      // Using Llama-3.3-70b-versatile as the large 70B parameter OSS model (closest to user's 120b request)
      const response = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Low temp for more deterministic extraction
        response_format: { type: 'json_object' }
      });

      const jsonStr = response.choices[0]?.message?.content || '{}';
      
      const result: AiExtractionResult = JSON.parse(jsonStr);
      return result;

    } catch (error) {
      console.error('Error during AI extraction with Groq:', error);
      throw error; // Throw it so the DocumentService catches it and the user sees the real reason
    }
  }
}
