import { BaseAdapter } from "./base";

export class GeminiAdapter extends BaseAdapter {
  readonly provider = "gemini";
  readonly baseUrl = "generativelanguage.googleapis.com";

  async getAuthHeaders(apiKey: string): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  getCompletionPath(): string {
    return "/chat/completions";
  }
}
