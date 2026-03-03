/**
 * Fetches system prompt templates from the Elsai Prompt Service (FastAPI).
 * Falls back to hardcoded defaults when the service is unreachable so the
 * application keeps working during local development without the service.
 */

import logger from "../logger.js";

const PROMPT_SERVICE_URL = process.env.PROMPT_SERVICE_URL?.replace(/\/$/, "");
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  content: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const FALLBACKS: Record<string, string> = {
  "adr-generate-draft": `You are an expert software architect specializing in Architecture Decision Records (ADRs).
Your task is to generate a complete, well-structured ADR draft based on the given title and description.
Return ONLY valid JSON with exactly these four keys: "context", "decision", "consequences", "alternatives".
Each value should be rich HTML (using <p>, <ul>, <li>, <strong>, <em> tags only — no headings).
Be specific, actionable, and professional. Think like a senior architect.`,

  "adr-review-adr": `You are a senior software architect performing a thorough review of an Architecture Decision Record (ADR).
Evaluate the ADR on completeness, clarity, risk awareness, and architectural soundness.
Return ONLY valid JSON with this exact structure:
{
  "overallScore": <1-10>,
  "completeness": { "score": <1-10>, "feedback": "<string>" },
  "clarity": { "score": <1-10>, "feedback": "<string>" },
  "risks": ["<risk1>", "<risk2>"],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"],
  "missingConsiderations": ["<missing item 1>", "<missing item 2>"]
}
Be specific and constructive. Reference the ADR content directly in your feedback.`,

  "adr-suggest-adrs": `You are a senior software architect. Given a list of project requirements (FR/NFR) and existing ADRs, identify architectural decisions that are missing and should be documented.
Return ONLY valid JSON:
{
  "suggestions": [
    {
      "title": "<concise ADR title>",
      "description": "<1-2 sentences describing the decision needed>",
      "addressesRequirements": ["<req code 1>", "<req code 2>"],
      "priority": "high|medium|low",
      "rationale": "<why this ADR is needed>"
    }
  ]
}
Focus on gaps — don't suggest ADRs that are clearly already covered by existing ones. Return 3-7 suggestions maximum.`,

  "adr-search": `You are a semantic search engine for Architecture Decision Records (ADRs).
Given a natural language query and a list of ADRs, rank the most relevant ones.
Return ONLY valid JSON:
{
  "results": [
    { "adrId": <number>, "score": <0.0-1.0>, "explanation": "<1 sentence why this matches>" }
  ]
}
Return at most 10 results, only those with score >= 0.3, sorted by score descending.`,
};

export async function getPrompt(name: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(name);
  if (cached && now < cached.expiresAt) {
    return cached.content;
  }

  if (!PROMPT_SERVICE_URL) {
    logger.warn(`PROMPT_SERVICE_URL not set — using fallback for prompt '${name}'`);
    return getFallback(name);
  }

  try {
    const res = await fetch(`${PROMPT_SERVICE_URL}/prompts/${encodeURIComponent(name)}`);
    if (!res.ok) {
      throw new Error(`Prompt service responded ${res.status} for '${name}'`);
    }
    const data = (await res.json()) as { content: string };
    cache.set(name, { content: data.content, expiresAt: now + CACHE_TTL_MS });
    return data.content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to fetch prompt '${name}' from service (${msg}) — using fallback`);
    return getFallback(name);
  }
}

function getFallback(name: string): string {
  const text = FALLBACKS[name];
  if (!text) {
    throw new Error(`No prompt found for '${name}' and no fallback defined`);
  }
  return text;
}
