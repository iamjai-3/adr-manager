export interface AIProvider {
  chat(systemPrompt: string, userPrompt: string): Promise<string>;
}

export type ProviderName = "openai" | "anthropic" | "google";
