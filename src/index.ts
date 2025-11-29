import { Hono } from "hono";
import { cors } from "hono/cors";
import { stream } from "hono/streaming";
import {
  ChatCompletionsStreamResponse,
  convertClaudeRequestToOpenAI,
  convertOpenAINonStreamToClaude,
  convertOpenAIStreamToClaude,
  createStreamState,
  getFinalStreamEvents,
  handleOpenAIErrorResponse,
  TextResponse,
} from "./converters";
import {
  convertClaudeToOpenAIChunk,
  createClaudeToOpenAIState,
} from "./stream";

const app = new Hono();

// CORS
app.use("*", cors());

function extractBaseUrl(
  path: string,
  endpoint: "/v1/messages" | "/v1/chat/completions",
): string {
  const baseUrl = path.replace(endpoint, "").substring(1);
  return baseUrl;
}

function isGeminiUrl(url: string): boolean {
  return url.includes("generativelanguage.googleapis.com");
}

async function handleClaudeToOpenAI(c: any) {
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

    // Determine target URL
    const targetUrl = isGeminiUrl(baseUrl)
      ? `https://${baseUrl}/chat/completions`
      : `https://${baseUrl}/v1/chat/completions`;

    // Forward to target API

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Use appropriate auth header based on target API
    requestHeaders["Authorization"] = `Bearer ${apiKey}`;

    const openAIResponse = await fetch(targetUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(openaiRequest),
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
          // 4. 循环读取 OpenAI 的流式响应
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

                // 5. 解析 OpenAI chunk
                const openAIChunk: ChatCompletionsStreamResponse =
                  JSON.parse(data);

                // 6. 存储最后的 usage（用于最后发送）
                if (openAIChunk.usage) {
                  finalUsage = openAIChunk.usage;
                }

                // 7. 转换为 Claude 格式（核心函数！）
                const claudeEvents = convertOpenAIStreamToClaude(
                  openAIChunk,
                  state,
                );

                // 8. 立即发送给客户端（保持流式）
                for (const event of claudeEvents) {
                  await streamWriter.write(
                    `data: ${JSON.stringify(event)}\n\n`,
                  );
                }
              }
            }
          }

          // 9. 发送最后的结束事件
          const finalEvents = getFinalStreamEvents(state, finalUsage);
          for (const event of finalEvents) {
            await streamWriter.write(`data: ${JSON.stringify(event)}\n\n`);
          }

          // 10. 发送结束标记
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
    return c.json(
      { error: { message: `Internal server error: ${error.message}` } },
      500 as any,
    );
  }
}

app.post("*", async (c) => {
  const path = c.req.path;
  if (path.endsWith("/v1/messages")) {
    return handleClaudeToOpenAI(c);
  } else if (path.endsWith("/v1/messages/count_tokens")) {
    return c.json({
      input_tokens: 42,
    });
  } else {
    return c.json(
      { error: "Endpoint not supported. Use /v1/messages for Claude format" },
      404,
    );
  }
});

// ============================================================================
// Health check
// ============================================================================

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;
