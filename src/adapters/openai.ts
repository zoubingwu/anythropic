import { BaseAdapter } from "./base";

export class OpenAIAdapter extends BaseAdapter {
  readonly provider = "openai";
  readonly baseUrl = "api.openai.com";

  async getAuthHeaders(apiKey: string): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  getCompletionPath(): string {
    return "/v1/chat/completions";
  }
}
