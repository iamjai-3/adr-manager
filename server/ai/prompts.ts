import { logger } from "../logger.js";

const PROMPT_SERVICE_URL = process.env.PROMPT_SERVICE_URL?.replace(/\/$/, "");
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  content: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getPrompt(name: string): Promise<string> {
  if (!PROMPT_SERVICE_URL) {
    throw new Error(`PROMPT_SERVICE_URL is not set — cannot fetch prompt '${name}'`);
  }

  const now = Date.now();
  const cached = cache.get(name);
  if (cached && now < cached.expiresAt) {
    return cached.content;
  }

  const res = await fetch(`${PROMPT_SERVICE_URL}/prompts/${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`Prompt service responded ${res.status} for prompt '${name}'`);
  }

  const data = (await res.json()) as { content: string };
  cache.set(name, { content: data.content, expiresAt: now + CACHE_TTL_MS });
  logger.info(`Fetched prompt '${name}' from Elsai prompt service`);
  return data.content;
}
