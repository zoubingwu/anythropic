import { ModelAdapter } from "../types/adapter";
import { CopilotAdapter } from "./copilot";
import { GeminiAdapter } from "./gemini";
import { KiroAdapter } from "./kiro";
import { OpenAIAdapter } from "./openai";

export function createAdapter(baseUrl: string): ModelAdapter {
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return new GeminiAdapter();
  }

  if (baseUrl.includes("api.githubcopilot.com")) {
    return new CopilotAdapter();
  }

  if (baseUrl.includes("codewhisperer") || baseUrl.includes("aws")) {
    return new KiroAdapter();
  }

  return new OpenAIAdapter();
}
