import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "../types";

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey });
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = res.content[0];
    if (block.type !== "text") return "";
    return block.text;
  }
}
