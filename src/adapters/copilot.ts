import { getCopilotToken } from "../utils";
import { BaseAdapter } from "./base";

export class CopilotAdapter extends BaseAdapter {
  readonly provider = "copilot";
  readonly baseUrl = "api.githubcopilot.com";

  async getAuthHeaders(apiKey: string): Promise<Record<string, string>> {
    const realToken = await getCopilotToken(apiKey);
    return {
      Authorization: `Bearer ${realToken}`,
      "Copilot-Integration-Id": "vscode-chat",
      "Editor-Version": "vscode/1.95.3",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "Openai-Intent": "conversation-panel",
      "X-Github-Api-Version": "2025-04-01",
      "X-Request-Id": `${crypto.randomUUID()}`,
      "X-Vscode-User-Agent-Library-Version": "electron-fetch",
      "X-Initiator": "user",
    };
  }

  getCompletionPath(): string {
    return "/chat/completions";
  }
}
