export function extractBaseUrl(
  path: string,
  endpoint: "/v1/messages" | "/v1/chat/completions",
): string {
  const baseUrl = path.replace(endpoint, "").substring(1);
  return baseUrl;
}

export function isGeminiUrl(url: string): boolean {
  return url.includes("generativelanguage.googleapis.com");
}

export function isCopilot(url: string): boolean {
  return url.includes("api.githubcopilot.com");
}

export function isOpenAI(url: string): boolean {
  return url.includes("api.openai.com");
}

export function getChatCompletionPath(baseUrl: string): string {
  if (isGeminiUrl(baseUrl) || isCopilot(baseUrl)) {
    return "/chat/completions";
  }

  return "/v1/chat/completions";
}
