import { createAdapter } from "../adapters";
import { OpenAIChatCompletionsResponse } from "../types/openai";
import { extractBaseUrl } from "../utils";

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

    const adapter = createAdapter(baseUrl);
    const claudeRequest = await c.req.json();
    const openaiRequest = adapter.transformRequest(claudeRequest);
    const authHeaders = await adapter.getAuthHeaders(apiKey);

    const targetUrl = `https://${baseUrl}${adapter.getCompletionPath()}`;
    const openAIResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
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

    const openAIResult: OpenAIChatCompletionsResponse =
      await openAIResponse.json();
    const claudeResponse = adapter.transformResponse(openAIResult);
    return c.json(claudeResponse, openAIResponse.status);
  } catch (error: any) {
    console.log("Internal server error: ", error);
    return c.json(
      { error: { message: `Internal server error: ${error.message}` } },
      500,
    );
  }
}
