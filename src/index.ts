import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  convertClaudeRequestToOpenAI,
  convertClaudeResponseToOpenAI,
  convertOpenAIRequestToClaude,
  convertOpenAIResponseToClaude,
} from "./converters";
import {
  convertClaudeToOpenAIChunk,
  convertOpenAIToClaudeChunk,
  createClaudeToOpenAIState,
  createOpenAIToClaudeState,
} from "./stream";

const app = new Hono();

// CORS
app.use("*", cors());

// ============================================================================
// Helper Functions
// ============================================================================

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

// ============================================================================
// Route Handlers
// ============================================================================

async function handleClaudeToOpenAI(c: any) {
  try {
    // Parse request headers
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
    const claudeRequest = await c.req.json();

    // Convert to OpenAI format
    const openaiRequest = convertClaudeRequestToOpenAI(claudeRequest);

    // Determine target URL
    const targetUrl = isGeminiUrl(baseUrl)
      ? `https://${baseUrl}/chat/completions`
      : `https://${baseUrl}/v1/chat/completions`;

    // Forward to target API
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(openaiRequest),
    });

    // Stream response
    if (openaiRequest.stream) {
      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const state = createClaudeToOpenAIState();

      // Read streaming response
      const reader = response.body!.getReader();

      (async () => {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                await writer.write(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const claudeChunk = JSON.parse(data);
                const openaiChunk = convertClaudeToOpenAIChunk(
                  state,
                  claudeChunk,
                );

                if (openaiChunk) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`),
                  );
                }
              } catch (e) {
                // Parse error, ignore
              }
            }
          }
        }

        await writer.close();
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // Non-streaming response
    const data = (await response.json()) as any;
    const convertedResponse = convertClaudeResponseToOpenAI(data);

    return c.json(convertedResponse, response.status as any);
  } catch (error) {
    return c.json({ error: { message: "Internal server error" } }, 500 as any);
  }
}

async function handleOpenAIToClaude(c: any) {
  try {
    // Parse request headers
    const apiKey =
      c.req.header("x-api-key") ||
      c.req.header("authorization")?.replace("Bearer ", "");

    if (!apiKey) {
      return c.json(
        { error: { message: "Missing x-api-key or authorization header" } },
        400 as any,
      );
    }

    // Extract base URL from path (e.g., "api.anthropic.com")
    const baseUrl = extractBaseUrl(c.req.path, "/v1/chat/completions");

    if (!baseUrl) {
      return c.json(
        {
          error: {
            message:
              "Could not extract base URL from path. Format: /<base-url>/v1/chat/completions",
          },
        },
        400 as any,
      );
    }

    // Parse request body
    const openaiRequest = await c.req.json();

    // Convert to Claude format
    const claudeRequest = convertOpenAIRequestToClaude(openaiRequest);

    // Forward to Claude API
    const response = await fetch(`https://${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(claudeRequest),
    });

    // If response error, return as-is
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: { message: "Unknown error" } }));
      return c.json(errorData, response.status as any);
    }

    // Stream response
    if (claudeRequest.stream) {
      const encoder = new TextEncoder();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const state = createOpenAIToClaudeState();

      // Read OpenAI streaming response
      const reader = response.body!.getReader();

      (async () => {
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                await writer.write(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const openaiChunk = JSON.parse(data);
                const claudeEvents = convertOpenAIToClaudeChunk(
                  state,
                  openaiChunk,
                );

                if (claudeEvents) {
                  await writer.write(encoder.encode(claudeEvents));
                }
              } catch (e) {
                // Parse error, ignore
              }
            }
          }
        }

        await writer.close();
      })();

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // Non-streaming response
    const data = await response.json();
    const convertedResponse = convertOpenAIResponseToClaude(data);

    return c.json(convertedResponse, response.status as any);
  } catch (error) {
    return c.json({ error: { message: "Internal server error" } }, 500 as any);
  }
}

// ============================================================================
// Main Route Handler
// ============================================================================

// Unified handler for all POST requests
app.post("*", async (c) => {
  const path = c.req.path;

  // Route dispatch based on path endings
  if (path.endsWith("/v1/messages")) {
    return handleClaudeToOpenAI(c);
  } else if (path.endsWith("/v1/chat/completions")) {
    return handleOpenAIToClaude(c);
  } else {
    return c.json({ error: "Not found" }, 404);
  }
});

// ============================================================================
// Health check
// ============================================================================

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;
