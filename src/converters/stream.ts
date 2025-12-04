import {
  ClaudeContent,
  ClaudeStreamResponse,
  ClaudeUsage,
  StreamConversionState,
} from "../types";
import { ChatCompletionsStreamResponse, ChatUsage } from "../types/openai";
import {
  CLAUDE_CONTENT_TYPES,
  CLAUDE_DELTA_TYPES,
  CLAUDE_STOP_REASONS,
  CLAUDE_STREAM_TYPES,
} from "./constants";

/**
 * Convert OpenAI streaming response to Claude streaming responses
 */
export function convertOpenAIStreamToClaude(
  openAIResponse: ChatCompletionsStreamResponse,
  state: StreamConversionState,
): ClaudeStreamResponse[] {
  const events: ClaudeStreamResponse[] = [];

  // Generate message_id if not exists
  if (!state.messageId) {
    state.messageId = `msg_${Date.now()}`;
  }

  // Send message_start (only once)
  if (!state.sentMessageStart) {
    state.sentMessageStart = true;

    events.push({
      type: CLAUDE_STREAM_TYPES.MESSAGE_START,
      message: {
        id: state.messageId,
        type: "message",
        role: "assistant",
        model: openAIResponse.model,
        content: [],
        usage: openAIResponse.usage
          ? convertOpenAIUsageToClaude(openAIResponse.usage)
          : { input_tokens: 0, output_tokens: 0 },
        stop_reason: null,
        stop_sequence: null,
      },
    });

    // Send ping
    events.push({
      type: CLAUDE_STREAM_TYPES.PING,
    });
  }

  // Process each choice
  for (const choice of openAIResponse.choices) {
    const delta = choice.delta;

    // Handle reasoning/thinking content
    if (delta.reasoning_content) {
      if (
        state.currentContentType !== null &&
        state.currentContentType !== CLAUDE_CONTENT_TYPES.THINKING
      ) {
        events.push({
          type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
          index: state.currentContentIndex,
        });
      }

      if (state.currentContentType !== CLAUDE_CONTENT_TYPES.THINKING) {
        // Close previous block
        if (state.currentContentIndex >= 0) {
          events.push({
            type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
            index: state.currentContentIndex,
          });
        }

        // Start new thinking block
        state.currentContentIndex++;
        state.currentContentType = CLAUDE_CONTENT_TYPES.THINKING;
        state.thinkingTexts[state.currentContentIndex] = "";

        events.push({
          type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_START,
          index: state.currentContentIndex,
          content_block: {
            type: CLAUDE_CONTENT_TYPES.THINKING,
            thinking: "",
          },
        });
      }

      state.thinkingTexts[state.currentContentIndex] += delta.reasoning_content;

      events.push({
        type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_DELTA,
        index: state.currentContentIndex,
        delta: {
          type: CLAUDE_DELTA_TYPES.THINKING_DELTA,
          thinking: delta.reasoning_content,
        },
      });
    }

    // Handle text content
    else if (delta.content) {
      if (
        state.currentContentType !== null &&
        state.currentContentType !== CLAUDE_CONTENT_TYPES.TEXT
      ) {
        events.push({
          type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
          index: state.currentContentIndex,
        });
      }

      if (state.currentContentType !== CLAUDE_CONTENT_TYPES.TEXT) {
        // Close previous block
        if (state.currentContentIndex >= 0) {
          events.push({
            type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
            index: state.currentContentIndex,
          });
        }

        // Start new text block
        state.currentContentIndex++;
        state.currentContentType = CLAUDE_CONTENT_TYPES.TEXT;
        state.contentTexts[state.currentContentIndex] = "";

        events.push({
          type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_START,
          index: state.currentContentIndex,
          content_block: {
            type: CLAUDE_CONTENT_TYPES.TEXT,
            text: "",
          },
        });
      }

      state.contentTexts[state.currentContentIndex] += delta.content;

      events.push({
        type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_DELTA,
        index: state.currentContentIndex,
        delta: {
          type: CLAUDE_DELTA_TYPES.TEXT_DELTA,
          text: delta.content,
        },
      });
    }

    // Handle tool calls
    if (delta.tool_calls && delta.tool_calls.length > 0) {
      for (const toolCall of delta.tool_calls) {
        const idx = toolCall.index || 0;

        // Capture thought signature from first tool call (Gemini)
        if (
          idx === 0 &&
          toolCall.extra_content?.google?.thought_signature &&
          !state.thinkingSignature
        ) {
          state.thinkingSignature =
            toolCall.extra_content.google.thought_signature;
        }

        // Initialize tool call if new
        if (!state.toolCalls[idx]) {
          if (
            state.currentContentType !== null &&
            state.currentContentType !== CLAUDE_CONTENT_TYPES.TOOL_USE
          ) {
            events.push({
              type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
              index: state.currentContentIndex,
            });
          }

          // Close previous block
          if (state.currentContentIndex >= 0) {
            events.push({
              type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
              index: state.currentContentIndex,
            });
          }

          state.currentContentIndex++;
          state.currentContentType = CLAUDE_CONTENT_TYPES.TOOL_USE;

          state.toolCalls[idx] = {
            index: idx,
            id: toolCall.id || `tool_${idx}`,
            name: toolCall.function?.name || "",
            input: "",
          };

          // Build content_block with signature for first tool call
          const contentBlock: ClaudeContent = {
            type: CLAUDE_CONTENT_TYPES.TOOL_USE,
            id: state.toolCalls[idx].id,
            name: state.toolCalls[idx].name,
            input: {},
          };

          // Add signature to first tool call only
          if (idx === 0 && state.thinkingSignature) {
            contentBlock.signature = state.thinkingSignature;
          }

          events.push({
            type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_START,
            index: state.currentContentIndex,
            content_block: contentBlock,
          });
        }

        // Send tool arguments delta
        if (toolCall.function?.arguments) {
          state.toolCalls[idx].input += toolCall.function.arguments;

          events.push({
            type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_DELTA,
            index: state.currentContentIndex,
            delta: {
              type: CLAUDE_DELTA_TYPES.INPUT_JSON_DELTA,
              partial_json: toolCall.function.arguments,
            },
          });
        }
      }
    }
  }

  return events;
}

/**
 * Get final stream events after all chunks are processed
 */
export function getFinalStreamEvents(
  state: StreamConversionState,
  usage?: ChatUsage,
): ClaudeStreamResponse[] {
  const events: ClaudeStreamResponse[] = [];

  // Close last content block
  if (state.currentContentIndex >= 0) {
    events.push({
      type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_STOP,
      index: state.currentContentIndex,
    });
  }

  // Send message_delta with stop reason and usage
  events.push({
    type: CLAUDE_STREAM_TYPES.MESSAGE_DELTA,
    delta: {
      stop_reason: CLAUDE_STOP_REASONS.END_TURN,
      stop_sequence: null,
    },
    usage: usage ? convertOpenAIUsageToClaude(usage) : undefined,
  });

  // Send message_stop
  events.push({
    type: CLAUDE_STREAM_TYPES.MESSAGE_STOP,
  });

  return events;
}

/**
 * Create initial stream state
 */
export function createStreamState(): StreamConversionState {
  return {
    messageId: "",
    sentMessageStart: false,
    currentContentIndex: -1,
    currentContentType: null,
    contentTexts: [],
    thinkingTexts: [],
    toolCalls: [],
    sentThinkingSignature: false,
  };
}

/**
 * Convert OpenAI usage to Claude usage
 */
function convertOpenAIUsageToClaude(usage?: ChatUsage): ClaudeUsage {
  if (!usage) {
    return {
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  const claudeUsage: ClaudeUsage = {
    input_tokens:
      (usage.prompt_tokens || 0) -
      (usage.prompt_tokens_details?.cached_tokens || 0),
    output_tokens: usage.completion_tokens || 0,
  };

  if (usage.prompt_tokens_details) {
    claudeUsage.cache_read_input_tokens =
      usage.prompt_tokens_details.cached_tokens || 0;
    claudeUsage.cache_creation_input_tokens =
      usage.prompt_tokens_details.cache_creation_tokens || 0;
  }

  return claudeUsage;
}
