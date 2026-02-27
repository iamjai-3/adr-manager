import OpenAI from "openai";
import type { AIProvider } from "../types";

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    this.client = new OpenAI({ apiKey });
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });
    return res.choices[0]?.message?.content ?? "";
  }
}
