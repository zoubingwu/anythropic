import { stream } from "hono/streaming";
import {
  convertClaudeRequestToOpenAI,
  convertOpenAINonStreamToClaude,
  convertOpenAIStreamToClaude,
  createStreamState,
  getFinalStreamEvents,
  handleOpenAIErrorResponse,
} from "../converters";
import { ChatCompletionsStreamResponse, TextResponse } from "../types/openai";
import {
  extractBaseUrl,
  getChatCompletionPath,
  getCopilotToken,
} from "../utils";

export async function handleClaudeToOpenAI(c: any) {
  try {
    const apiKey =
      c.req.header("x-api-key") ||
      c.req.header("authorization")?.replace("Bearer ", "");

    if (!apiKey) {
      return c.json(
        { error: { message: "Missing x-api-key or authorization header" } },
        400 as any,
      );
    }

    // Extract base URL from path (e.g., "generativelanguage.googleapis.com/v1beta/openai")
    const baseUrl = extractBaseUrl(c.req.path, "/v1/messages");

    if (!baseUrl) {
      return c.json(
        {
          error: {
            message:
              "Could not extract base URL from path. Format: /<base-url>/v1/messages",
          },
        },
        400 as any,
      );
    }

    // Parse request body
    const rawBody = await c.req.text();
    const claudeRequest = JSON.parse(rawBody);

    // Convert to OpenAI format
    const openaiRequest = convertClaudeRequestToOpenAI(claudeRequest);
    const targetUrl = `https://${baseUrl}${getChatCompletionPath(baseUrl)}`;

    // Forward to target API
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Check if this is Copilot
    const isCopilotUrl = baseUrl.includes("api.githubcopilot.com");

    if (isCopilotUrl) {
      const realToken = await getCopilotToken(apiKey);
      requestHeaders["Copilot-Integration-Id"] = "vscode-chat";
      requestHeaders["Editor-Version"] = "vscode/1.95.3";
      requestHeaders["Editor-Plugin-Version"] = "copilot-chat/0.26.7";
      requestHeaders["User-Agent"] = `GitHubCopilotChat/0.26.7`;
      requestHeaders["Openai-Intent"] = "conversation-panel";
      requestHeaders["X-Github-Api-Version"] = "2025-04-01";
      requestHeaders["X-Request-Id"] = `${crypto.randomUUID()}`;
      requestHeaders["X-Vscode-User-Agent-Library-Version"] = "electron-fetch";
      requestHeaders["X-Initiator"] = "user";
      requestHeaders["Authorization"] = `Bearer ${realToken}`;
    } else {
      // Use appropriate auth header based on target API
      requestHeaders["Authorization"] = `Bearer ${apiKey}`;
    }

    const body = JSON.stringify(openaiRequest);

    const openAIResponse = await fetch(targetUrl, {
      method: "POST",
      headers: requestHeaders,
      body,
    });

    if (!openAIResponse.ok) {
      const claudeError = await handleOpenAIErrorResponse(openAIResponse);
      return c.json(claudeError, openAIResponse.status);
    }

    // Stream response
    if (openaiRequest.stream) {
      const state = createStreamState();
      c.header("Content-Type", "text/event-stream");

      return stream(c, async (streamWriter) => {
        const reader = openAIResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalUsage = undefined;

        try {
          // 4. Loop through OpenAI stream response
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                // 5. Parse OpenAI chunk
                const openAIChunk: ChatCompletionsStreamResponse =
                  JSON.parse(data);

                // 6. Store last usage (for final send)
                if (openAIChunk.usage) {
                  finalUsage = openAIChunk.usage;
                }

                // 7. Convert to Claude format (core function!)
                const claudeEvents = convertOpenAIStreamToClaude(
                  openAIChunk,
                  state,
                );

                // 8. Send to client immediately (keep streaming)
                for (const event of claudeEvents) {
                  await streamWriter.write(
                    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                  );
                }
              }
            }
          }

          // 9. Send final end events
          const finalEvents = getFinalStreamEvents(state, finalUsage);
          for (const event of finalEvents) {
            await streamWriter.write(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            );
          }

          // 10. Send end marker
          await streamWriter.write("data: [DONE]\n\n");
        } finally {
          await streamWriter.close();
        }
      });
    }

    // Non-streaming response
    const openAIResult: TextResponse = await openAIResponse.json();
    const claudeResponse = convertOpenAINonStreamToClaude(openAIResult);
    return c.json(claudeResponse, openAIResponse.status as any);
  } catch (error: any) {
    console.log("Internal server error: ", error);
    return c.json(
      { error: { message: `Internal server error: ${error.message}` } },
      500 as any,
    );
  }
}
