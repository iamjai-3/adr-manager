import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider } from "../types";

export class GoogleProvider implements AIProvider {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set");
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });
    const result = await model.generateContent(userPrompt);
    return result.response.text();
  }
}
