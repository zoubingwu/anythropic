const copilotTokenCache = new Map<
  string,
  { token: string; expires_at: number }
>();

/**
 * Get Copilot token with caching
 */
export async function getCopilotToken(apiKey: string): Promise<string> {
  const cached = copilotTokenCache.get(apiKey);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires_at > now + 60) {
    return cached.token;
  }

  const response = await fetch(
    "https://api.github.com/copilot_internal/v2/token",
    {
      method: "GET",
      headers: {
        Authorization: `token ${apiKey}`,
        "Editor-Version": "vscode/1.95.3",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "X-Github-Api-Version": "2025-04-01",
        "X-Vscode-User-Agent-Library-Version": "electron-fetch",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get Copilot token: ${response.statusText}`);
  }

  const data = (await response.json()) as { token: string; expires_at: number };
  const token = data.token;
  const expires_at = data.expires_at;
  copilotTokenCache.set(apiKey, { token, expires_at });
  return token;
}
