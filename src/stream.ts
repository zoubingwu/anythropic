import { ClaudeStreamResponse, OpenAIStreamChunk } from "./types";

// ============================================================================
// Claude → OpenAI Stream Conversion
// ============================================================================

export interface ClaudeToOpenAIConverterState {
  messageId: string;
}

export function createClaudeToOpenAIState(): ClaudeToOpenAIConverterState {
  return {
    messageId: "",
  };
}

export function convertClaudeToOpenAIChunk(
  state: ClaudeToOpenAIConverterState,
  claudeChunk: ClaudeStreamResponse,
): OpenAIStreamChunk | null {
  switch (claudeChunk.type) {
    case "message_start":
      if (claudeChunk.message) {
        state.messageId = claudeChunk.message.id;
      }
      return {
        id: state.messageId,
        object: "chat.completion.chunk",
        created: Date.now(),
        model: claudeChunk.message?.model || "",
        choices: [
          {
            index: 0,
            delta: { role: "assistant" },
            finish_reason: undefined,
          },
        ],
      };

    case "content_block_start":
      if (!claudeChunk.content_block) return null;

      if (claudeChunk.content_block.type === "text") {
        return {
          id: state.messageId,
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "",
          choices: [
            {
              index: 0,
              delta: { content: "" },
              finish_reason: undefined,
            },
          ],
        };
      } else if (claudeChunk.content_block.type === "tool_use") {
        const toolIndex = claudeChunk.index || 0;
        return {
          id: state.messageId,
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: toolIndex,
                    id: claudeChunk.content_block.id,
                    type: "function",
                    function: {
                      name: claudeChunk.content_block.name,
                      arguments: "",
                    },
                  },
                ],
              },
              finish_reason: undefined,
            },
          ],
        };
      }
      return null;

    case "content_block_delta":
      if (!claudeChunk.delta) return null;

      if (claudeChunk.delta.type === "text_delta") {
        return {
          id: state.messageId,
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "",
          choices: [
            {
              index: 0,
              delta: { content: claudeChunk.delta.text || "" },
              finish_reason: undefined,
            },
          ],
        };
      } else if (claudeChunk.delta.type === "input_json_delta") {
        const toolIndex = claudeChunk.index || 0;
        return {
          id: state.messageId,
          object: "chat.completion.chunk",
          created: Date.now(),
          model: "",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: toolIndex,
                    id: "",
                    type: "function",
                    function: {
                      name: "",
                      arguments: claudeChunk.delta.partial_json || "",
                    },
                  },
                ],
              },
              finish_reason: undefined,
            },
          ],
        };
      }
      return null;

    case "message_delta":
      const finishReason = mapClaudeToOpenAIFinishReason(
        claudeChunk.delta?.stop_reason,
      );
      return {
        id: state.messageId,
        object: "chat.completion.chunk",
        created: Date.now(),
        model: "",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
        usage: claudeChunk.usage
          ? {
              prompt_tokens: claudeChunk.usage.input_tokens || 0,
              completion_tokens: claudeChunk.usage.output_tokens || 0,
              total_tokens:
                (claudeChunk.usage.input_tokens || 0) +
                (claudeChunk.usage.output_tokens || 0),
            }
          : undefined,
      };

    default:
      return null;
  }
}

function mapClaudeToOpenAIFinishReason(
  claudeStopReason?: string,
): string | undefined {
  switch (claudeStopReason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      return undefined;
  }
}

// ============================================================================
// OpenAI → Claude Stream Conversion
// ============================================================================

export interface OpenAIToClaudeConverterState {
  pendingToolCalls: Map<
    number,
    {
      id: string;
      name: string;
      arguments: string;
    }
  >;
}

export function createOpenAIToClaudeState(): OpenAIToClaudeConverterState {
  return {
    pendingToolCalls: new Map(),
  };
}

export function convertOpenAIToClaudeChunk(
  state: OpenAIToClaudeConverterState,
  openaiChunk: OpenAIStreamChunk,
): string | null {
  const events: string[] = [];

  // Skip if no messageId (first chunk should have messageId)
  if (!openaiChunk.id) return null;

  // Handle role
  if (openaiChunk.choices?.[0]?.delta?.role === "assistant") {
    events.push(
      JSON.stringify({
        type: "message_start",
        message: {
          id: openaiChunk.id,
          type: "message",
          role: "assistant",
          model: openaiChunk.model,
          content: [],
        },
      }),
    );
  }

  // Handle content
  if (openaiChunk.choices?.[0]?.delta?.content) {
    const text = openaiChunk.choices[0].delta.content;
    events.push(
      JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      }),
    );
  }

  // Handle tool calls
  if (openaiChunk.choices?.[0]?.delta?.tool_calls) {
    openaiChunk.choices[0].delta.tool_calls.forEach((toolCall) => {
      if (toolCall.id) {
        // Start new tool call
        state.pendingToolCalls.set(toolCall.index || 0, {
          id: toolCall.id,
          name: toolCall.function?.name || "",
          arguments: "",
        });

        events.push(
          JSON.stringify({
            type: "content_block_start",
            index: 0, // Each tool_call is a separate content block in Claude
            content_block: {
              type: "tool_use",
              id: toolCall.id,
              name: toolCall.function?.name,
              input: {},
            },
          }),
        );
      } else if (toolCall.function?.arguments) {
        // Continue building tool call
        const pending = state.pendingToolCalls.get(toolCall.index || 0);
        if (pending) {
          pending.arguments += toolCall.function.arguments;

          events.push(
            JSON.stringify({
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "input_json_delta",
                partial_json: toolCall.function.arguments,
              },
            }),
          );
        }
      }
    });
  }

  // Handle finish
  if (openaiChunk.choices?.[0]?.finish_reason) {
    const finishReason = mapOpenAIToClaudeFinishReason(
      openaiChunk.choices[0].finish_reason,
    );
    events.push(
      JSON.stringify({
        type: "message_delta",
        delta: { stop_reason: finishReason },
      }),
    );

    // Cleanup pending tool calls
    state.pendingToolCalls.clear();
  }

  // Handle usage
  if (openaiChunk.usage) {
    events.push(
      JSON.stringify({
        type: "message_stop",
      }),
    );
  }

  return events.length > 0 ? events.join("\n") + "\n" : null;
}

function mapOpenAIToClaudeFinishReason(openaiFinishReason?: string): string {
  switch (openaiFinishReason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    default:
      return "end_turn";
  }
}
