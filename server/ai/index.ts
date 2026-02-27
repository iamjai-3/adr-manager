import type { AIProvider, ProviderName } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleProvider } from "./providers/google";

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const name = (process.env.AI_PROVIDER || "openai") as ProviderName;

  if (name === "anthropic") {
    _provider = new AnthropicProvider();
  } else if (name === "google") {
    _provider = new GoogleProvider();
  } else {
    _provider = new OpenAIProvider();
  }

  return _provider;
}

export function isAIConfigured(): boolean {
  const name = (process.env.AI_PROVIDER || "openai") as ProviderName;
  if (name === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (name === "google") return !!process.env.GOOGLE_AI_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

/** Parse JSON from LLM output, stripping markdown code fences if present */
export function parseAIJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
