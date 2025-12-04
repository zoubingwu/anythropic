import { ModelAdapter } from "../types";
import { CopilotAdapter } from "./copilot";
import { GeminiAdapter } from "./gemini";
import { OpenAIAdapter } from "./openai";

export function createAdapter(baseUrl: string): ModelAdapter {
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return new GeminiAdapter();
  }

  if (baseUrl.includes("api.githubcopilot.com")) {
    return new CopilotAdapter();
  }

  return new OpenAIAdapter();
}
