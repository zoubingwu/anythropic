import { createAdapter } from "../adapters/factory";
import { OpenAIChatCompletionsResponse } from "../types/openai";
import { extractBaseUrl } from "../utils/url";

export async function handleClaudeToOpenAI(c: any) {
  try {
    const apiKey =
      c.req.header("x-api-key") ||
      c.req.header("authorization")?.replace("Bearer ", "");

    if (!apiKey) {
      return c.json(
        { error: { message: "Missing x-api-key or authorization header" } },
        400,
      );
    }

    const baseUrl = extractBaseUrl(c.req.path, "/v1/messages");
    if (!baseUrl) {
      return c.json(
        {
          error: {
            message:
              "Could not extract base URL from path. Format: /<base-url>/v1/messages",
          },
        },
        400,
      );
    }

    const originalHeaders = c.req.header();
    const adapter = createAdapter(baseUrl);
    const claudeRequest = await c.req.json();
    const openaiRequest = adapter.transformRequest(claudeRequest);
    const authHeaders = await adapter.getAuthHeaders(apiKey);

    const targetUrl = `https://${baseUrl}${adapter.getCompletionPath()}`;

    // Remove proxy authentication headers to prevent passing them upstream
    const {
      "x-api-key": _,
      authorization: __,
      ...headersWithoutAuth
    } = originalHeaders;

    const openAIResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        ...headersWithoutAuth, // Pass through original headers in case some provider checks them( like kimi)
        ...authHeaders, // Add upstream authentication
      },
      body: JSON.stringify(openaiRequest),
    });

    if (!openAIResponse.ok) {
      console.log("http error from upstream: ", {
        url: openAIResponse.url,
        model: openaiRequest.model,
        status: openAIResponse.status,
      });
      const claudeError = await adapter.transformHttpError(openAIResponse);
      return c.json(claudeError, openAIResponse.status);
    }

    if (openaiRequest.stream) {
      return adapter.handleStreamResponse(c, openAIResponse);
    }

    // Handle Kiro adapter specially since it returns AWS Event Stream format
    if (adapter.provider === "kiro") {
      const kiroResponse = await (adapter as any).parseKiroResponse(openAIResponse);
      const claudeResponse = adapter.transformResponse(kiroResponse);
      return c.json(claudeResponse, openAIResponse.status);
    }

    // Default handling for other adapters
    const openAIResult: OpenAIChatCompletionsResponse =
      await openAIResponse.json();
    const claudeResponse = adapter.transformResponse(openAIResult);
    return c.json(claudeResponse, openAIResponse.status);
  } catch (error: any) {
    console.error("Internal server error: ", error);
    return c.json(
      { error: { message: `Internal server error: ${error.message}` } },
      500,
    );
  }
}
