import { stream } from "hono/streaming";
import {
  convertOpenAIStreamToClaude,
  createStreamState,
  getFinalStreamEvents,
} from "../converters/stream";
import { OpenAIChatCompletionsStreamResponse } from "../types/openai";
import { BaseAdapter } from "./base";

/**
 * AWS Event Stream Parser for Kiro API
 * Kiro API returns responses in AWS Event Stream format, not JSON
 */
class AwsEventStreamParser {
  private buffer: string = "";
  private currentEvent: { type?: string; data?: string } | null = null;

  feed(chunk: string): any[] {
    const events: any[] = [];
    this.buffer += chunk;

    // Look for JSON patterns in the buffer
    const patterns = [
      { pattern: '{"content":', type: "content" },
      { pattern: '{"name":', type: "tool_start" },
      { pattern: '{"input":', type: "tool_input" },
      { pattern: '{"usage":', type: "usage" },
    ];

    while (true) {
      let earliestPos = -1;
      let earliestType = "";
      let earliestPattern = "";

      // Find the earliest matching pattern
      for (const { pattern, type } of patterns) {
        const pos = this.buffer.indexOf(pattern);
        if (pos !== -1 && (earliestPos === -1 || pos < earliestPos)) {
          earliestPos = pos;
          earliestType = type;
          earliestPattern = pattern;
        }
      }

      if (earliestPos === -1) {
        break;
      }

      // Find the matching closing brace
      let braceCount = 0;
      let jsonEnd = earliestPos;
      let foundStart = false;

      for (let i = earliestPos; i < this.buffer.length; i++) {
        if (this.buffer[i] === "{") {
          braceCount++;
          foundStart = true;
        } else if (this.buffer[i] === "}") {
          braceCount--;
          if (braceCount === 0 && foundStart) {
            jsonEnd = i;
            break;
          }
        }
      }

      if (!foundStart || braceCount !== 0) {
        // JSON not complete, wait for more data
        break;
      }

      // Extract and parse JSON
      const jsonStr = this.buffer.substring(earliestPos, jsonEnd + 1);
      this.buffer = this.buffer.substring(jsonEnd + 1);

      try {
        const data = JSON.parse(jsonStr);
        const event = this._processEvent(data, earliestType);
        if (event) {
          events.push(event);
        }
      } catch (e) {
        console.warn("Failed to parse JSON event:", jsonStr.substring(0, 100));
      }
    }

    return events;
  }

  private _processEvent(data: any, eventType: string): any | null {
    if (eventType === "content") {
      return this._processContentEvent(data);
    } else if (eventType === "tool_start") {
      return this._processToolStartEvent(data);
    } else if (eventType === "tool_input") {
      return this._processToolInputEvent(data);
    } else if (eventType === "usage") {
      return this._processUsageEvent(data);
    }
    return null;
  }

  private _processContentEvent(data: any): any | null {
    const content = data.content;
    if (!content) {
      return null;
    }
    return { type: "content", data: content };
  }

  private _processToolStartEvent(data: any): any | null {
    return { type: "tool_start", data: data };
  }

  private _processToolInputEvent(data: any): any | null {
    return { type: "tool_input", data: data };
  }

  private _processUsageEvent(data: any): any | null {
    return { type: "usage", data: data.usage || data };
  }

  getBuffer(): string {
    return this.buffer;
  }
}

/**
 * Kiro adapter for Anthropic API compatibility
 */
export class KiroAdapter extends BaseAdapter {
  readonly provider = "kiro";
  readonly baseUrl = "q.us-east-1.amazonaws.com";

  private region: string;
  private clientId?: string;
  private clientSecret?: string;

  constructor(region: string = "us-east-1") {
    super();
    this.region = region;
    // clientId and clientSecret are no longer needed since token exchange happens in Zsh
    this.clientId = undefined;
    this.clientSecret = undefined;
  }

  /**
   * Handle streaming response from Kiro API (AWS Event Stream format)
   */
  async handleStreamResponse(
    c: any,
    openAIResponse: Response,
    model: string = "claude-4-5-sonnet",
  ): Promise<any> {
    const state = createStreamState();
    c.header("Content-Type", "text/event-stream");

    const parser = new AwsEventStreamParser();
    const reader = openAIResponse.body!.getReader();
    const decoder = new TextDecoder();
    let finalUsage: any = undefined;

    return stream(c, async (streamWriter) => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const events = parser.feed(chunk);

          for (const event of events) {
            if (event.type === "content") {
              // Convert Kiro content event to OpenAI stream format
              const openAIChunk: OpenAIChatCompletionsStreamResponse = {
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      content: event.data,
                    },
                    finish_reason: null,
                  },
                ],
              };

              // Convert to Claude stream format
              const claudeEvents = convertOpenAIStreamToClaude(
                openAIChunk,
                state,
              );

              // Write events to stream
              for (const event of claudeEvents) {
                await streamWriter.write(
                  `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                );
              }
            } else if (event.type === "usage") {
              finalUsage = event.data;
            }
          }
        }

        // Send final events
        const finalEvents = getFinalStreamEvents(state, finalUsage);
        for (const event of finalEvents) {
          await streamWriter.write(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          );
        }

        await streamWriter.write("data: [DONE]\n\n");
      } finally {
        reader.releaseLock();
        await streamWriter.close();
      }
    });
  }

  /**
   * Parse Kiro API response (AWS Event Stream format) into a complete response object
   */
  async parseKiroResponse(response: Response): Promise<any> {
    const parser = new AwsEventStreamParser();
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    let completeResponse: any = {
      content: "",
      tool_calls: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = parser.feed(chunk);

        for (const event of events) {
          if (event.type === "content" && event.data) {
            completeResponse.content += event.data;
          } else if (event.type === "tool_start" && event.data) {
            completeResponse.tool_calls.push({
              id: event.data.toolUseId,
              type: "function",
              function: {
                name: event.data.name,
                arguments: "",
              },
            });
          } else if (event.type === "tool_input" && event.data) {
            // Find the tool call and append arguments
            const toolCall = completeResponse.tool_calls.find(
              (tc: any) => tc.id === event.data.toolUseId,
            );
            if (toolCall) {
              toolCall.function.arguments += event.data.input;
            }
          } else if (event.type === "usage" && event.data) {
            completeResponse.usage = {
              prompt_tokens: event.data.promptTokens || 0,
              completion_tokens: event.data.completionTokens || 0,
            };
          }
        }
      }

      // Process any remaining buffered data
      const remainingEvents = parser.feed("");
      for (const event of remainingEvents) {
        if (event.type === "content" && event.data) {
          completeResponse.content += event.data;
        }
      }

      return completeResponse;
    } finally {
      reader.releaseLock();
    }
  }

  async getAuthHeaders(apiKey: string): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "x-amz-target": "AWSCodeWhispererService.GenerateAssistantResponse",
      "User-Agent": `aws-sdk-rust/1.3.10 ua/2.1 api/codewhispererstreaming/0.1.12842 os/macos lang/rust/1.88.0 md/appVersion-1.23.1 app/AmazonQ-For-CLI`,
      "x-amz-user-agent": `aws-sdk-rust/1.3.10 ua/2.1 api/codewhispererstreaming/0.1.12842 os/macos lang/rust/1.88.0 m/F app/AmazonQ-For-CLI`,
      "x-amzn-codewhisperer-optout": "true",
      "x-amzn-kiro-agent-mode": "vibe",
      "amz-sdk-invocation-id": crypto.randomUUID(),
      "amz-sdk-request": "attempt=1; max=3",
      host: "q.us-east-1.amazonaws.com",
    };
  }

  getCompletionPath(): string {
    return "/generateAssistantResponse";
  }

  /**
   * Transform Anthropic request to Kiro API format
   */
  transformRequest(claudeRequest: any): any {
    const messages = claudeRequest.messages || [];
    const system = claudeRequest.system || "";
    const model = claudeRequest.model || "claude-4-5-sonnet";

    // Build conversation history in Kiro format
    const history: any[] = [];
    const nonSystemMessages = messages.filter(
      (msg: any) => msg.role !== "system",
    );

    for (const msg of nonSystemMessages) {
      if (msg.role === "user") {
        const content = this.extractContent(msg.content);
        let userInput: any = {
          content:
            system && !history.length ? `${system}\n\n${content}` : content,
          modelId: this.mapModelToKiro(model),
          origin: "AI_EDITOR",
        };

        history.push({ userInputMessage: userInput });
      } else if (msg.role === "assistant") {
        const content = this.extractContent(msg.content);
        const assistantResponse: any = { content };

        // Handle tool calls
        if (msg.tool_calls) {
          const toolUses = msg.tool_calls.map((tc: any) => ({
            name: tc.function?.name || "",
            input: tc.function?.arguments
              ? JSON.parse(tc.function.arguments)
              : {},
            toolUseId: tc.id || "",
          }));
          assistantResponse.toolUses = toolUses;
        }

        history.push({ assistantResponseMessage: assistantResponse });
      }
    }

    // Current message (last one)
    const currentMessage = nonSystemMessages[nonSystemMessages.length - 1];
    const currentContent = this.extractContent(currentMessage.content);

    const userInputMessage = {
      content: currentContent,
      modelId: this.mapModelToKiro(model),
      origin: "AI_EDITOR",
    };

    // Build payload
    const payload: any = {
      conversationState: {
        chatTriggerType: "MANUAL",
        conversationId: this.generateConversationId(),
        currentMessage: {
          userInputMessage,
        },
      },
    };

    // Add history if present
    if (history.length > 1) {
      payload.conversationState.history = history.slice(0, -1);
    }

    return payload;
  }

  /**
   * Transform Kiro response to Anthropic format
   */
  transformResponse(kiroResponse: any): any {
    const content = kiroResponse.content || "";
    const toolCalls = kiroResponse.tool_calls || [];

    const anthropicContent: any[] = [];

    if (content) {
      anthropicContent.push({
        type: "text",
        text: content,
      });
    }

    for (const tc of toolCalls) {
      anthropicContent.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function?.name || "",
        input: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
      });
    }

    return {
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      content: anthropicContent,
      model: "claude-4-5-sonnet",
      stop_reason: toolCalls.length > 0 ? "tool_use" : "end_turn",
      usage: {
        input_tokens: kiroResponse.usage?.prompt_tokens || 0,
        output_tokens: kiroResponse.usage?.completion_tokens || 0,
      },
    };
  }

  /**
   * Transform Kiro stream response to Anthropic format
   */
  transformStreamResponse(kiroChunk: any, state: any): any[] {
    const events: any[] = [];

    if (kiroChunk.type === "content") {
      events.push({
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: kiroChunk.data,
        },
      });
    } else if (kiroChunk.type === "usage") {
      events.push({
        type: "message_delta",
        delta: {
          stop_reason: "end_turn",
        },
        usage: {
          input_tokens: kiroChunk.data?.prompt_tokens || 0,
          output_tokens: kiroChunk.data?.completion_tokens || 0,
        },
      });
    }

    return events;
  }

  private extractContent(content: any): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((item: any) => item.type === "text")
        .map((item: any) => item.text || "")
        .join("");
    }
    return "";
  }

  private mapModelToKiro(model: string): string {
    const modelMap: Record<string, string> = {
      "claude-3-5-sonnet-20241022": "CLAUDE_SONNET_4_5_20250929_V1_0",
      "claude-3-5-haiku-20241022": "claude-haiku-4.5",
      "claude-3-opus-20240229": "claude-opus-4.5",
    };

    return modelMap[model] || "claude-opus-4.5";
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(): string {
    const hostname = "localhost";
    const username = "user";
    return btoa(`${hostname}-${username}-anythropic`).replace(
      /[^a-zA-Z0-9]/g,
      "",
    );
  }
}
