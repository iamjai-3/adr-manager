import type { AIProvider, ProviderName } from "./types";

let _provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_provider) return _provider;

  const name = (process.env.AI_PROVIDER || "openai") as ProviderName;

  if (name === "anthropic") {
    const { AnthropicProvider } = require("./providers/anthropic");
    _provider = new AnthropicProvider();
  } else if (name === "google") {
    const { GoogleProvider } = require("./providers/google");
    _provider = new GoogleProvider();
  } else {
    const { OpenAIProvider } = require("./providers/openai");
    _provider = new OpenAIProvider();
  }

  return _provider!;
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
