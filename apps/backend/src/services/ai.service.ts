import { GoogleGenAI } from '@google/genai';
import { AiExtractionResult } from '../types/ai.types';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class AiService {
  /**
   * Extracts data from a PDF document using Gemini API.
   * Handles both text-based and scanned image-based PDFs.
   */
  static async extractDocumentData(filePath: string): Promise<AiExtractionResult | null> {
    try {
      // Read file as base64
      const fileBase64 = fs.readFileSync(filePath).toString('base64');
      
      const prompt = `
        You are a highly skilled clinical document processor. Analyze the attached clinical document.
        
        1. Determine the primary document type: "BP" (Blood Pressure) or "A1C" (Hemoglobin A1c). If it's neither, return "UNKNOWN".
        2. Identify the patient's age if present.
        3. Extract all valid readings of the identified type. For each reading, provide:
           - type: "BP" or "A1C"
           - value: The exact value found (e.g. "138/88" for BP, "7.4" for A1C). Strip out units like mmHg or %.
           - date: The date associated with the reading in YYYY-MM-DD format. If none, return null.
           - context: The context of the reading. If it says "goal", "target", "past", "previous", "historical", or "reference range", put that exact word. Otherwise, put "current".

        Return ONLY a raw JSON object (without markdown code blocks) matching this schema:
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
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: fileBase64,
                },
              },
            ],
          },
        ],
        config: {
          temperature: 0.1, // Low temp for more deterministic extraction
        }
      });

      let jsonStr = response.text || '{}';
      // Clean up markdown formatting if Gemini still adds it
      jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

      const result: AiExtractionResult = JSON.parse(jsonStr);
      return result;

    } catch (error) {
      console.error('Error during AI extraction:', error);
      return null;
    }
  }
}
