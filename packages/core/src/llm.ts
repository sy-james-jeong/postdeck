export interface LLMRequest {
  system?: string
  prompt: string
}

export interface LLMClient {
  complete(req: LLMRequest): Promise<string>
}
