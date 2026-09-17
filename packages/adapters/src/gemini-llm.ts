import { GoogleGenAI } from '@google/genai'
import type { LLMClient, LLMRequest } from '@postdeck/core'

// Edge adapter for the LLMClient port, backed by Google Gemini.
// The client is constructed lazily inside complete() so a missing/invalid-key
// error surfaces at call time (inside the CLI's try/catch), not at factory time.
// We guard the missing-key case ourselves: with no apiKey the SDK silently falls
// back to Google Application Default Credentials and throws a noisy
// "Could not load the default credentials" from google-auth-library. Throwing an
// explicit API-key error here short-circuits that path and matches the CLI's
// isMissingCredentialError regex.
// The system prompt is merged into `contents` rather than using a systemInstruction
// field, to avoid depending on SDK-version-specific request shapes.
export function createGeminiLLM(deps: { env: (n: string) => string | undefined }): LLMClient {
  const apiKey = deps.env('GEMINI_API_KEY') ?? deps.env('GOOGLE_API_KEY')
  return {
    async complete(req: LLMRequest): Promise<string> {
      if (!apiKey) throw new Error('Gemini: GEMINI_API_KEY (or GOOGLE_API_KEY) is not set')
      const ai = new GoogleGenAI({ apiKey })
      const contents = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt
      const res = await ai.models.generateContent({ model: 'gemini-3.6-flash', contents })
      return res.text ?? ''
    },
  }
}
