import {
  convertOpenAIStreamToClaude,
  createStreamState,
  getFinalStreamEvents,
} from "../converters/stream";
import { ClaudeAnyContentRequest, ClaudeToolCall } from "../types/claude";
import { OpenAIChatCompletionsStreamResponse } from "../types/openai";
import { BaseAdapter } from "./base";

/**
 * AWS Event Stream Parser for Kiro API
 * Kiro API returns responses in a text-based format with JSON embedded.
 * This parser uses text pattern matching to extract JSON events from the stream.
 */
class AwsEventStreamParser {
  private buffer: string = "";
  private lastContent: string | null = null;
  private currentToolCall: any = null;
  private toolCalls: any[] = [];

  // Patterns for finding JSON events (ordered by priority)
  private EVENT_PATTERNS = [
    { pattern: '{"content":', type: "content" },
    { pattern: '{"name":', type: "tool_start" },
    { pattern: '{"input":', type: "tool_input" },
    { pattern: '{"stop":', type: "tool_stop" },
    { pattern: '{"followupPrompt":', type: "followup" },
    { pattern: '{"usage":', type: "usage" },
    { pattern: '{"contextUsagePercentage":', type: "context_usage" },
  ];

  feed(chunk: Uint8Array): any[] {
    // Decode chunk to string and append to buffer
    try {
      const textChunk = new TextDecoder().decode(chunk);
      this.buffer += textChunk;
    } catch (e) {
      console.warn("[AwsEventStreamParser] Failed to decode chunk:", e);
      return [];
    }

    const events: any[] = [];

    // Process buffer until no more complete events found
    while (true) {
      // Find the earliest pattern in buffer
      let earliestPos = -1;
      let earliestType = "";

      for (const { pattern, type } of this.EVENT_PATTERNS) {
        const pos = this.buffer.indexOf(pattern);
        if (pos !== -1 && (earliestPos === -1 || pos < earliestPos)) {
          earliestPos = pos;
          earliestType = type;
        }
      }

      if (earliestPos === -1) {
        break; // No patterns found
      }

      // Find the matching closing brace
      const jsonEnd = this._findMatchingBrace(this.buffer, earliestPos);
      if (jsonEnd === -1) {
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
        console.warn(
          `[AwsEventStreamParser] Failed to parse JSON: ${jsonStr.substring(0, 100)}`,
        );
      }
    }

    return events;
  }

  /**
   * Find the position of the matching closing brace, considering nesting and strings
   */
  private _findMatchingBrace(text: string, startPos: number): number {
    if (startPos >= text.length || text[startPos] !== "{") {
      return -1;
    }

    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startPos; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\" && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1; // No matching brace found
  }

  private _processEvent(data: any, eventType: string): any | null {
    if (eventType === "content") {
      return this._processContentEvent(data);
    } else if (eventType === "tool_start") {
      return this._processToolStartEvent(data);
    } else if (eventType === "tool_input") {
      return this._processToolInputEvent(data);
    } else if (eventType === "tool_stop") {
      return this._processToolStopEvent(data);
    } else if (eventType === "usage") {
      return this._processUsageEvent(data);
    } else if (eventType === "context_usage") {
      return this._processContextUsageEvent(data);
    }
    return null;
  }

  private _processContentEvent(data: any): any | null {
    const content = data.content;
    if (!content) {
      return null;
    }

    // Skip followupPrompt
    if (data.followupPrompt) {
      return null;
    }

    // Deduplicate repeating content
    if (content === this.lastContent) {
      return null;
    }

    this.lastContent = content;
    return { type: "content", data: content };
  }

  private _processToolStartEvent(data: any): any | null {
    // Finalize previous tool call if exists
    if (this.currentToolCall) {
      this._finalizeToolCall();
    }

    // input can be string or object
    let inputStr = "";
    if (data.input) {
      if (typeof data.input === "object") {
        inputStr = JSON.stringify(data.input);
      } else {
        inputStr = String(data.input);
      }
    }

    this.currentToolCall = {
      id: data.toolUseId || this._generateToolCallId(),
      type: "function",
      function: {
        name: data.name || "",
        arguments: inputStr,
      },
    };

    if (data.stop) {
      this._finalizeToolCall();
    }

    return null;
  }

  private _processToolInputEvent(data: any): any | null {
    if (this.currentToolCall) {
      let inputStr = "";
      if (data.input) {
        if (typeof data.input === "object") {
          inputStr = JSON.stringify(data.input);
        } else {
          inputStr = String(data.input);
        }
      }
      this.currentToolCall.function.arguments += inputStr;
    }
    return null;
  }

  private _processToolStopEvent(data: any): any | null {
    if (this.currentToolCall && data.stop) {
      this._finalizeToolCall();
    }
    return null;
  }

  private _processUsageEvent(data: any): any | null {
    return { type: "usage", data: data.usage || data };
  }

  private _processContextUsageEvent(data: any): any | null {
    return { type: "context_usage", data: data.contextUsagePercentage || 0 };
  }

  private _finalizeToolCall(): void {
    if (!this.currentToolCall) {
      return;
    }

    // Try to parse and normalize arguments as JSON
    let args = this.currentToolCall.function.arguments;
    const toolName = this.currentToolCall.function.name || "unknown";

    if (typeof args === "string") {
      if (args.trim()) {
        try {
          const parsed = JSON.parse(args);
          this.currentToolCall.function.arguments = JSON.stringify(parsed);
        } catch (e) {
          this.currentToolCall.function.arguments = "{}";
        }
      } else {
        this.currentToolCall.function.arguments = "{}";
      }
    } else if (typeof args === "object") {
      this.currentToolCall.function.arguments = JSON.stringify(args);
    } else {
      this.currentToolCall.function.arguments = "{}";
    }

    this.toolCalls.push(this.currentToolCall);
    this.currentToolCall = null;
  }

  getToolCalls(): any[] {
    if (this.currentToolCall) {
      this._finalizeToolCall();
    }
    return this._deduplicateToolCalls(this.toolCalls);
  }

  private _deduplicateToolCalls(toolCalls: any[]): any[] {
    // Simple deduplication by id
    const seenIds = new Set();
    const unique: any[] = [];

    for (const tc of toolCalls) {
      const tcId = tc.id;
      if (!tcId || !seenIds.has(tcId)) {
        seenIds.add(tcId);
        unique.push(tc);
      }
    }

    return unique;
  }

  private _generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  }

  getBuffer(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = "";
    this.lastContent = null;
    this.currentToolCall = null;
    this.toolCalls = [];
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
    let messageStarted = false;

    console.debug(
      `[KiroAdapter] Starting stream response handling for model: ${model}`,
    );

    const parser = new AwsEventStreamParser();
    const reader = openAIResponse.body!.getReader();
    const decoder = new TextDecoder();
    let finalUsage: any = undefined;

    // Set headers first
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");

    // Create a TransformStream to handle the conversion
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Process the stream in the background
    (async () => {
      try {
        let contentBlockIndex = 0;
        let textBlockStarted = false; // Track if we sent content_block_start for text

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const chunk = value; // Already Uint8Array from reader
          const events = parser.feed(chunk);

          for (const event of events) {
            if (event.type === "content") {
              // Initialize stream if not already done
              if (!messageStarted) {
                messageStarted = true;
                state.messageId = `msg_${Date.now()}`;

                // Send message_start
                const messageStartEvent = {
                  type: "message_start",
                  message: {
                    id: state.messageId,
                    type: "message",
                    role: "assistant",
                    model: model,
                    content: [],
                    usage: { input_tokens: 0, output_tokens: 0 },
                    stop_reason: null,
                    stop_sequence: null,
                  },
                };

                const messageStartData = `event: ${messageStartEvent.type}\ndata: ${JSON.stringify(messageStartEvent)}\n\n`;
                await writer.write(encoder.encode(messageStartData));
                console.debug(`[KiroAdapter] Sent message_start`);

                // Send ping
                const pingEvent = { type: "ping" };
                const pingData = `event: ping\ndata: ${JSON.stringify(pingEvent)}\n\n`;
                await writer.write(encoder.encode(pingData));

                // Send content_block_start for text
                textBlockStarted = true;
                const contentBlockStartEvent = {
                  type: "content_block_start",
                  index: contentBlockIndex,
                  content_block: {
                    type: "text",
                    text: "",
                  },
                };

                const contentBlockStartData = `event: ${contentBlockStartEvent.type}\ndata: ${JSON.stringify(contentBlockStartEvent)}\n\n`;
                await writer.write(encoder.encode(contentBlockStartData));
                console.debug(
                  `[KiroAdapter] Sent content_block_start for text`,
                );
              }

              // Send content_block_delta
              const contentDeltaEvent = {
                type: "content_block_delta",
                index: contentBlockIndex,
                delta: {
                  type: "text_delta",
                  text: event.data,
                },
              };

              const contentDeltaData = `event: ${contentDeltaEvent.type}\ndata: ${JSON.stringify(contentDeltaEvent)}\n\n`;
              await writer.write(encoder.encode(contentDeltaData));
            } else if (event.type === "usage") {
              finalUsage = event.data;
            }
            // tool_start, tool_input, tool_stop are handled internally by parser
          }
        }

        console.debug(`[KiroAdapter] Stream processing complete`);

        // Get all tool calls collected by parser
        const toolCalls = parser.getToolCalls();
        const hasToolCalls = toolCalls.length > 0;

        if (hasToolCalls) {
          console.debug(
            `[KiroAdapter] Found ${toolCalls.length} tool calls:`,
            toolCalls.map((tc) => tc.function?.name),
          );
        }

        // If we haven't started the message yet but have tool calls, start now
        if (!messageStarted && hasToolCalls) {
          messageStarted = true;
          state.messageId = `msg_${Date.now()}`;

          // Send message_start
          const messageStartEvent = {
            type: "message_start",
            message: {
              id: state.messageId,
              type: "message",
              role: "assistant",
              model: model,
              content: [],
              usage: { input_tokens: 0, output_tokens: 0 },
              stop_reason: null,
              stop_sequence: null,
            },
          };

          const messageStartData = `event: ${messageStartEvent.type}\ndata: ${JSON.stringify(messageStartEvent)}\n\n`;
          await writer.write(encoder.encode(messageStartData));
          console.debug(
            `[KiroAdapter] Sent message_start (tool-only response)`,
          );

          // Send ping
          const pingEvent = { type: "ping" };
          const pingData = `event: ping\ndata: ${JSON.stringify(pingEvent)}\n\n`;
          await writer.write(encoder.encode(pingData));
        }

        if (messageStarted) {
          // Only close text content block if it was actually started
          if (textBlockStarted) {
            const textBlockStopEvent = {
              type: "content_block_stop",
              index: contentBlockIndex,
            };
            const textBlockStopData = `event: ${textBlockStopEvent.type}\ndata: ${JSON.stringify(textBlockStopEvent)}\n\n`;
            await writer.write(encoder.encode(textBlockStopData));
            console.debug(`[KiroAdapter] Sent content_block_stop for text`);
            contentBlockIndex++;
          }

          // Send tool_use content blocks
          for (const tc of toolCalls) {
            console.debug(
              `[KiroAdapter] Sending tool_use block: ${tc.function?.name}`,
            );

            // content_block_start for tool_use
            const toolBlockStartEvent = {
              type: "content_block_start",
              index: contentBlockIndex,
              content_block: {
                type: "tool_use",
                id: tc.id,
                name: tc.function?.name || "",
                input: {},
              },
            };
            const toolBlockStartData = `event: ${toolBlockStartEvent.type}\ndata: ${JSON.stringify(toolBlockStartEvent)}\n\n`;
            await writer.write(encoder.encode(toolBlockStartData));

            // content_block_delta with input_json_delta
            let inputObj = {};
            try {
              inputObj = JSON.parse(tc.function?.arguments || "{}");
            } catch (e) {
              inputObj = {};
            }

            const toolDeltaEvent = {
              type: "content_block_delta",
              index: contentBlockIndex,
              delta: {
                type: "input_json_delta",
                partial_json: JSON.stringify(inputObj),
              },
            };
            const toolDeltaData = `event: ${toolDeltaEvent.type}\ndata: ${JSON.stringify(toolDeltaEvent)}\n\n`;
            await writer.write(encoder.encode(toolDeltaData));

            // content_block_stop
            const toolBlockStopEvent = {
              type: "content_block_stop",
              index: contentBlockIndex,
            };
            const toolBlockStopData = `event: ${toolBlockStopEvent.type}\ndata: ${JSON.stringify(toolBlockStopEvent)}\n\n`;
            await writer.write(encoder.encode(toolBlockStopData));

            contentBlockIndex++;
          }

          // Send message_delta with stop_reason
          const stopReason = hasToolCalls ? "tool_use" : "end_turn";
          console.debug(
            `[KiroAdapter] Sending message_delta with stop_reason: ${stopReason}`,
          );

          const messageDeltaEvent = {
            type: "message_delta",
            delta: {
              stop_reason: stopReason,
              stop_sequence: null,
            },
            usage: finalUsage
              ? {
                  input_tokens: finalUsage.promptTokens || 0,
                  output_tokens: finalUsage.completionTokens || 0,
                }
              : { input_tokens: 0, output_tokens: 0 },
          };

          const messageDeltaData = `event: ${messageDeltaEvent.type}\ndata: ${JSON.stringify(messageDeltaEvent)}\n\n`;
          await writer.write(encoder.encode(messageDeltaData));

          // Send message_stop
          const messageStopEvent = { type: "message_stop" };
          const messageStopData = `event: ${messageStopEvent.type}\ndata: ${JSON.stringify(messageStopEvent)}\n\n`;
          await writer.write(encoder.encode(messageStopData));
          console.debug(`[KiroAdapter] Sent message_stop`);
        }

        await writer.write(encoder.encode("data: [DONE]\n\n"));
        console.debug(`[KiroAdapter] Stream complete, sent [DONE]`);
      } catch (error) {
        console.error("[KiroAdapter] Stream error:", error);
      } finally {
        reader.releaseLock();
        await writer.close();
      }
    })();

    // Return the readable stream as Response
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  /**
   * Parse Kiro API response (AWS Event Stream format) into a complete response object
   */
  async handleJsonResponse(response: Response) {
    const parser = new AwsEventStreamParser();
    const reader = response.body!.getReader();

    let completeResponse: any = {
      content: "",
      tool_calls: [],
      usage: { prompt_tokens: 0, completion_tokens: 0 },
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = value; // Already Uint8Array from reader
        const events = parser.feed(chunk);

        for (const event of events) {
          if (event.type === "content" && event.data) {
            completeResponse.content += event.data;
          } else if (event.type === "usage" && event.data) {
            completeResponse.usage = {
              prompt_tokens: event.data.promptTokens || 0,
              completion_tokens: event.data.completionTokens || 0,
            };
          }
          // tool_start, tool_input, tool_stop are handled internally by parser
        }
      }

      // Get all tool calls collected by parser
      completeResponse.tool_calls = parser.getToolCalls();

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
  transformRequest(claudeRequest: ClaudeAnyContentRequest): any {
    const messages = claudeRequest.messages || [];
    const system = claudeRequest.system || "";
    const model = claudeRequest.model || "claude-4-5-sonnet";

    console.debug(
      `[KiroAdapter] transformRequest: ${messages.length} messages, model=${model}`,
    );

    // Build conversation history in Kiro format
    const history: any[] = [];
    const nonSystemMessages = messages.filter(
      (msg: any) => msg.role !== "system",
    );

    for (let i = 0; i < nonSystemMessages.length; i++) {
      const msg = nonSystemMessages[i];
      console.debug(
        `[KiroAdapter] Processing msg[${i}]: role=${msg.role}, content type=${typeof msg.content}, content isArray=${Array.isArray(msg.content)}`,
      );

      if (msg.role === "user") {
        const content = this.extractContent(msg.content);
        let userInput: any = {
          content:
            system && !history.length ? `${system}\n\n${content}` : content,
          modelId: this.mapModelToKiro(model),
          origin: "AI_EDITOR",
        };

        // Handle tool results in user messages
        const toolResults = this.extractToolResults(msg.content);
        if (toolResults.length > 0) {
          console.debug(
            `[KiroAdapter] Found ${toolResults.length} tool results in user message`,
          );
          userInput.userInputMessageContext = { toolResults };
        }

        history.push({ userInputMessage: userInput });
      } else if (msg.role === "assistant") {
        const content = this.extractContent(msg.content);
        const assistantResponse: any = { content };

        // Handle tool calls from assistant - check both tool_calls and content array
        const toolUses: any[] = [];

        // Check tool_calls field (OpenAI format)
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          console.debug(
            `[KiroAdapter] Found ${msg.tool_calls.length} tool_calls in assistant message`,
          );
          for (const tc of msg.tool_calls) {
            toolUses.push({
              name: tc.function?.name || "",
              input:
                tc.function?.arguments &&
                typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments)
                  : tc.function?.arguments || {},
              toolUseId: tc.id || this.generateToolCallId(),
            });
          }
        }

        // Check content array for tool_use items (Claude format)
        if (Array.isArray(msg.content)) {
          for (const item of msg.content) {
            if (item.type === "tool_use") {
              console.debug(
                `[KiroAdapter] Found tool_use in content: ${item.name}, id=${item.id}`,
              );
              toolUses.push({
                name: item.name || "",
                input: item.input || {},
                toolUseId: item.id || this.generateToolCallId(),
              });
            }
          }
        }

        if (toolUses.length > 0) {
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

    // Add tools and tool_results if present
    const context: any = {};

    // Add tools from claudeRequest if any
    if (
      claudeRequest.tools &&
      Array.isArray(claudeRequest.tools) &&
      claudeRequest.tools.length > 0
    ) {
      context.tools = claudeRequest.tools.map((tool: any) => ({
        toolSpecification: {
          name: tool.name || "",
          description: tool.description || "",
          inputSchema: { json: tool.input_schema || {} },
        },
      }));
    }

    // Handle tool results in current message
    const toolResults = this.extractToolResults(currentMessage.content);
    if (toolResults.length > 0) {
      context.toolResults = toolResults;
    }

    if (Object.keys(context).length > 0) {
      (userInputMessage as any).userInputMessageContext = context;
    }

    // Build payload
    const payload: any = {
      stream: claudeRequest.stream,
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
    // Handle object content (fallback)
    if (content && typeof content === "object") {
      return JSON.stringify(content);
    }
    return "";
  }

  private extractToolResults(content: any): any[] {
    if (!Array.isArray(content)) return [];

    const toolResults: any[] = [];
    for (const item of content) {
      if (item.type === "tool_result") {
        toolResults.push({
          content: [{ text: item.content || "" }],
          status: "success",
          toolUseId: item.tool_call_id || item.tool_use_id || "",
        });
      }
    }
    return toolResults;
  }

  private mapModelToKiro(model: string): string {
    const modelMap: Record<string, string> = {
      "claude-haiku-4.5": "claude-haiku-4.5",
      "claude-sonnet-4.5": "claude-haiku-4.5",
      "claude-opus-4.5": "claude-opus-4.5",
    };

    return modelMap[model] || "claude-opus-4.5";
  }

  private generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
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
