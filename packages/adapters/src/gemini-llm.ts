import { GoogleGenAI } from '@google/genai'
import type { LLMClient, LLMRequest } from '@postdeck/core'

// Edge adapter for the LLMClient port, backed by Google Gemini.
// The client is constructed lazily inside complete() so a missing/invalid-key
// error surfaces at call time (inside the CLI's try/catch), not at factory time.
// The system prompt is merged into `contents` rather than using a systemInstruction
// field, to avoid depending on SDK-version-specific request shapes.
export function createGeminiLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const apiKey = deps.env('GEMINI_API_KEY') ?? deps.env('GOOGLE_API_KEY')
  return {
    async complete(req: LLMRequest): Promise<string> {
      const ai = new GoogleGenAI({ apiKey })
      const contents = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt
      const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents })
      return res.text ?? ''
    },
  }
}
