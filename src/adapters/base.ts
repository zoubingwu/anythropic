import { stream } from "hono/streaming";
import {
  convertOpenAIErrorToClaude,
  handleOpenAIErrorResponse,
} from "../converters/error";
import { convertClaudeRequestToOpenAI } from "../converters/request";
import { convertOpenAINonStreamToClaude } from "../converters/response";
import {
  convertOpenAIStreamToClaude,
  createStreamState,
  getFinalStreamEvents,
} from "../converters/stream";
import { ModelAdapter } from "../types/adapter";
import {
  ClaudeAnyContentRequest,
  ClaudeErrorResponse,
  ClaudeResponse,
  ClaudeStreamResponse,
} from "../types/claude";
import { StreamConversionState } from "../types/conversion";
import {
  OpenAIChatCompletionsResponse,
  OpenAIChatCompletionsStreamResponse,
  OpenAIRequest,
} from "../types/openai";

export abstract class BaseAdapter implements ModelAdapter {
  abstract readonly provider: string;
  abstract readonly baseUrl: string;

  transformRequest(claudeRequest: ClaudeAnyContentRequest): OpenAIRequest {
    return convertClaudeRequestToOpenAI(claudeRequest);
  }

  transformResponse(
    openaiResponse: OpenAIChatCompletionsResponse,
  ): ClaudeResponse {
    return convertOpenAINonStreamToClaude(openaiResponse);
  }

  transformStreamResponse(
    openaiChunk: OpenAIChatCompletionsStreamResponse,
    state: StreamConversionState,
  ): ClaudeStreamResponse[] {
    return convertOpenAIStreamToClaude(openaiChunk, state);
  }

  transformError(error: any): ClaudeErrorResponse {
    return convertOpenAIErrorToClaude(error);
  }

  async transformHttpError(response: Response): Promise<ClaudeErrorResponse> {
    const errorData = await handleOpenAIErrorResponse(response);
    console.log("http error from upstream: ", errorData);
    return this.transformError(errorData);
  }

  async handleStreamResponse(c: any, openAIResponse: Response): Promise<any> {
    const state = createStreamState();
    c.header("Content-Type", "text/event-stream");

    return stream(c, async (streamWriter) => {
      const reader = openAIResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalUsage = undefined;

      try {
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

              const openAIChunk: OpenAIChatCompletionsStreamResponse =
                JSON.parse(data);

              if (openAIChunk.usage) {
                finalUsage = openAIChunk.usage;
              }

              const claudeEvents = this.transformStreamResponse(
                openAIChunk,
                state,
              );

              for (const event of claudeEvents) {
                await streamWriter.write(
                  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                );
              }
            }
          }
        }

        const finalEvents = getFinalStreamEvents(state, finalUsage);
        for (const event of finalEvents) {
          await streamWriter.write(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        }

        await streamWriter.write("data: [DONE]\n\n");
      } finally {
        await streamWriter.close();
      }
    });
  }

  abstract getAuthHeaders(apiKey: string): Promise<Record<string, string>>;

  abstract getCompletionPath(): string;
}
