/**
 * ============================================================================
 * Types
 * ============================================================================
 */

// OpenAI API Types
export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

// OpenAI Error Types
export interface OpenAIError {
  code: number;
  message: string;
  status: string;
}

export type OpenAIErrorResponse = {
  error: OpenAIError;
}[];

export interface MessageContent {
  type: "text" | "image_url" | "input_audio";
  text?: string;
  image_url?: ImageURL;
  input_audio?: InputAudio;
}

export interface ImageURL {
  url: string;
  detail?: "auto" | "low" | "high";
}

export interface InputAudio {
  data: string;
  format: "wav" | "mp3";
}

export interface Tool {
  type: "function" | string;
  function: Function;
}

export interface Function {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  arguments?: string;
}

export interface ToolCall {
  id?: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  index?: number;
  extra_content?: {
    google?: {
      thought_signature?: string;
    };
  };
}

export interface StreamOptions {
  include_usage: boolean;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: Tool[];
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | {
        type: "function";
        function: { name: string };
      };
  stop?: string | string[];
  stream_options?: StreamOptions;
  seed?: number;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  web_search_count?: number;
  prompt_tokens_details?: {
    cached_tokens: number;
    audio_tokens: number;
    cache_creation_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens: number;
    audio_tokens: number;
    accepted_prediction_tokens: number;
    rejected_prediction_tokens: number;
  };
}

export interface TextResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content?: string | null;
      reasoning_content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | string;
  }>;
  usage?: ChatUsage;
}

export interface ChatCompletionsStreamResponse {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      reasoning_content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?:
      | "stop"
      | "length"
      | "tool_calls"
      | "content_filter"
      | string
      | null;
  }>;
  usage?: ChatUsage;
}

export interface ClaudeCacheControl {
  type: "ephemeral";
  ttl?: string; // "5m" | "1h"
}

export interface ClaudeImageSource {
  type: "base64" | "url";
  media_type?: string;
  data?: string;
  url?: string;
}

export interface ClaudeContent {
  type: "text" | "thinking" | "tool_use" | "tool_result" | "image";
  text?: string;
  thinking?: string;
  source?: ClaudeImageSource;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  content?: any;
  tool_use_id?: string;
  cache_control?: ClaudeCacheControl;
  signature?: string;
}

export interface ClaudeAnyContentMessage {
  role: "user" | "assistant";
  content: string | ClaudeContent[] | any;
}

export interface ClaudeInputSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[] | any[];
}

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema?: ClaudeInputSchema;
  type?: string;
  display_width_px?: number;
  display_height_px?: number;
  display_number?: number;
  cache_control?: ClaudeCacheControl;
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
  user_location?: {
    type?: string;
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
}

export interface ClaudeThinking {
  type: "enabled" | "disabled";
  budget_tokens?: number;
}

export interface ClaudeAnyContentRequest {
  model: string;
  messages: ClaudeAnyContentMessage[];
  system?: ClaudeContent[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: ClaudeTool[];
  tool_choice?: any;
  stream?: boolean;
  stop_sequences?: string[];
  thinking?: ClaudeThinking;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  server_tool_use?: {
    web_search_requests?: number;
    execution_time_seconds?: number;
  };
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: ClaudeContent[];
  stop_reason:
    | "end_turn"
    | "max_tokens"
    | "tool_use"
    | "stop_sequence"
    | string;
  stop_sequence?: string | null;
  usage: ClaudeUsage;
}

export interface ClaudeDelta {
  stop_reason?:
    | "end_turn"
    | "max_tokens"
    | "tool_use"
    | "stop_sequence"
    | string;
  stop_sequence?: string;
  type?: string;
  thinking?: string;
  signature?: string;
  text?: string;
  partial_json?: string;
}

export interface ClaudeStreamResponse {
  type:
    | "message_start"
    | "message_delta"
    | "message_stop"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "ping";
  message?: ClaudeResponse;
  content_block?: ClaudeContent;
  delta?: ClaudeDelta;
  usage?: ClaudeUsage;
  index?: number;
}

export interface ClaudeError {
  type: string;
  message: string;
}

export interface ClaudeErrorResponse {
  type: "error";
  error: ClaudeError;
}

const CLAUDE_CONTENT_TYPES = {
  TEXT: "text",
  THINKING: "thinking",
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
  IMAGE: "image",
} as const;

const CLAUDE_STOP_REASONS = {
  END_TURN: "end_turn",
  MAX_TOKENS: "max_tokens",
  TOOL_USE: "tool_use",
  STOP_SEQUENCE: "stop_sequence",
} as const;

const CLAUDE_STREAM_TYPES = {
  MESSAGE_START: "message_start",
  MESSAGE_DELTA: "message_delta",
  MESSAGE_STOP: "message_stop",
  CONTENT_BLOCK_START: "content_block_start",
  CONTENT_BLOCK_DELTA: "content_block_delta",
  CONTENT_BLOCK_STOP: "content_block_stop",
  PING: "ping",
} as const;

const CLAUDE_DELTA_TYPES = {
  TEXT_DELTA: "text_delta",
  THINKING_DELTA: "thinking_delta",
  INPUT_JSON_DELTA: "input_json_delta",
} as const;

const OPENAI_FINISH_REASONS = {
  STOP: "stop",
  LENGTH: "length",
  TOOL_CALLS: "tool_calls",
  CONTENT_FILTER: "content_filter",
} as const;

/**
 * ============================================================================
 * Request Conversion: Claude → OpenAI
 * ============================================================================
 */

/**
 * Convert Claude request format to OpenAI request format
 */
export function convertClaudeRequestToOpenAI(
  claudeRequest: ClaudeAnyContentRequest,
): OpenAIRequest {
  const openAIRequest: OpenAIRequest = {
    model: claudeRequest.model,
    messages: [],
    stream: claudeRequest.stream,
  };

  // Set optional parameters
  if (claudeRequest.max_tokens !== undefined) {
    openAIRequest.max_tokens = claudeRequest.max_tokens;
  }
  if (claudeRequest.max_completion_tokens !== undefined) {
    openAIRequest.max_completion_tokens = claudeRequest.max_completion_tokens;
  }
  if (claudeRequest.temperature !== undefined) {
    openAIRequest.temperature = claudeRequest.temperature;
  }
  if (claudeRequest.top_p !== undefined) {
    openAIRequest.top_p = claudeRequest.top_p;
  }

  // Convert tools
  if (claudeRequest.tools && claudeRequest.tools.length > 0) {
    openAIRequest.tools = convertClaudeToolsToOpenAI(claudeRequest.tools);
    openAIRequest.tool_choice = convertClaudeToolChoiceToOpenAI(
      claudeRequest.tool_choice,
    );
  }

  // Convert stop sequences
  if (claudeRequest.stop_sequences && claudeRequest.stop_sequences.length > 0) {
    openAIRequest.stop = claudeRequest.stop_sequences;
  }

  // Set stream options if streaming
  if (claudeRequest.stream) {
    openAIRequest.stream_options = {
      include_usage: true,
    };
  }

  // Convert system messages
  if (claudeRequest.system && claudeRequest.system.length > 0) {
    const systemMessages = convertClaudeSystemToOpenAI(claudeRequest.system);
    openAIRequest.messages.push(...systemMessages);
  }

  // Convert messages
  const convertedMessages = convertClaudeMessagesToOpenAI(
    claudeRequest.messages,
  );
  openAIRequest.messages.push(...convertedMessages);

  return openAIRequest;
}

/**
 * Convert Claude system content to OpenAI system messages
 */
function convertClaudeSystemToOpenAI(system: ClaudeContent[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];
  const systemTexts: string[] = [];

  for (const content of system) {
    if (content.type === "text" && content.text) {
      systemTexts.push(content.text);
    }
  }

  if (systemTexts.length > 0) {
    messages.push({
      role: "system",
      content: systemTexts.join("\n"),
    });
  }

  return messages;
}

/**
 * Convert Claude messages to OpenAI messages
 */
function convertClaudeMessagesToOpenAI(
  messages: ClaudeAnyContentMessage[],
): OpenAIMessage[] {
  const openAIMessages: OpenAIMessage[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      openAIMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      const result = convertClaudeContentArray(msg.content, msg.role);

      // Add the main message with content
      if (result.content || (result.toolCalls && result.toolCalls.length > 0)) {
        openAIMessages.push({
          role: msg.role as "user" | "assistant",
          content: result.content,
          tool_calls: result.toolCalls,
        });
      }

      // Add tool messages for tool_results
      if (result.toolMessages && result.toolMessages.length > 0) {
        openAIMessages.push(...result.toolMessages);
      }
    }
  }

  return openAIMessages;
}

interface ConvertedContent {
  content?: string | MessageContent[] | null;
  toolCalls?: ToolCall[];
  toolMessages?: OpenAIMessage[];
}

/**
 * Convert Claude content array to OpenAI format
 */
function convertClaudeContentArray(
  contents: ClaudeContent[],
  role: string,
): ConvertedContent {
  const result: ConvertedContent = {
    content: null,
    toolCalls: [],
    toolMessages: [],
  };

  const messageContents: MessageContent[] = [];

  for (const content of contents) {
    switch (content.type) {
      case "text":
        if (content.text) {
          messageContents.push({
            type: "text",
            text: content.text,
          });
        }
        break;

      case "thinking":
        if (content.thinking) {
          messageContents.push({
            type: "text",
            text: content.thinking,
          });
        }
        break;

      case "image":
        if (content.source) {
          let imageUrl: string;
          if (content.source.type === "base64" && content.source.data) {
            const mediaType = content.source.media_type || "image/jpeg";
            imageUrl = `data:${mediaType};base64,${content.source.data}`;
          } else {
            imageUrl = content.source.url || "";
          }
          messageContents.push({
            type: "image_url",
            image_url: { url: imageUrl },
          });
        }
        break;

      case "tool_use":
        if (content.id && content.name && content.input !== undefined) {
          const args =
            typeof content.input === "string"
              ? content.input
              : JSON.stringify(content.input || {});

          const toolCall: ToolCall = {
            id: content.id,
            type: "function",
            function: {
              name: content.name,
              arguments: args,
            },
          };

          // Preserve thought signature if present
          if (content.signature) {
            toolCall.extra_content = {
              google: {
                thought_signature: content.signature,
              },
            };
          }

          result.toolCalls!.push(toolCall);
        }
        break;

      case "tool_result":
        let toolContent: string | MessageContent[] | null = null;
        if (typeof content.content === "string") {
          toolContent = content.content;
        } else if (Array.isArray(content.content)) {
          // Recursively convert nested content
          const nestedResult = convertClaudeContentArray(
            content.content,
            "tool",
          );
          toolContent = nestedResult.content as string | MessageContent[];
        }

        const toolMessage: OpenAIMessage = {
          role: "tool",
          content: toolContent,
          tool_call_id: content.tool_use_id || "",
        };

        result.toolMessages!.push(toolMessage);
        break;
    }
  }

  if (messageContents.length > 0) {
    result.content = messageContents;
  }

  return result;
}

/**
 * Convert Claude tools to OpenAI tools
 */
function convertClaudeToolsToOpenAI(claudeTools: ClaudeTool[]): Tool[] {
  return claudeTools.map((tool) => {
    const openAITool: Tool = {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: {},
      },
    };

    if (tool.input_schema) {
      const params: Record<string, any> = {
        type: tool.input_schema.type || "object",
        properties: tool.input_schema.properties || {},
      };

      // Only add required field if it's non-empty
      if (
        tool.input_schema.required &&
        Array.isArray(tool.input_schema.required) &&
        tool.input_schema.required.length > 0
      ) {
        params.required = tool.input_schema.required;
      }

      openAITool.function.parameters = params;
    }

    return openAITool;
  });
}

/**
 * Convert Claude tool_choice to OpenAI tool_choice
 */
function convertClaudeToolChoiceToOpenAI(toolChoice: any): any {
  if (!toolChoice) {
    return "auto";
  }

  if (typeof toolChoice === "string") {
    if (toolChoice === "any") {
      return "required";
    }
    return toolChoice;
  }

  if (typeof toolChoice === "object") {
    // Handle object format
    if (toolChoice.type === "tool") {
      if (toolChoice.name) {
        return {
          type: "function",
          function: { name: toolChoice.name },
        };
      }
    } else if (toolChoice.type === "any") {
      return "required";
    } else if (toolChoice.type === "auto") {
      return "auto";
    }
  }

  return "auto";
}

/**
 * ============================================================================
 * Response Conversion: OpenAI → Claude
 * ============================================================================
 */

/**
 * Convert OpenAI non-streaming response to Claude response
 */
export function convertOpenAINonStreamToClaude(
  openAIResponse: TextResponse,
): ClaudeResponse {
  const claudeResponse: ClaudeResponse = {
    id: openAIResponse.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: openAIResponse.model,
    content: [],
    stop_reason: CLAUDE_STOP_REASONS.END_TURN,
    usage: convertOpenAIUsageToClaude(openAIResponse.usage),
  };

  // Process each choice (typically only one)
  for (const choice of openAIResponse.choices) {
    const message = choice.message;

    // Handle reasoning content (for o1 models)
    if (message.reasoning_content) {
      claudeResponse.content.push({
        type: "thinking",
        thinking: message.reasoning_content,
      });
    }

    // Handle text content
    if (message.content) {
      claudeResponse.content.push({
        type: "text",
        text: message.content,
      });
    }

    // Handle tool calls
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        let input: Record<string, any> = {};
        if (toolCall.function.arguments) {
          try {
            input = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            input = {};
          }
        }

        const content: ClaudeContent = {
          type: "tool_use",
          id: toolCall.id || "",
          name: toolCall.function.name,
          input: input,
        };

        // Preserve thought signature if present
        if (toolCall.extra_content?.google?.thought_signature) {
          content.signature = toolCall.extra_content.google.thought_signature;
        }

        claudeResponse.content.push(content);
      }
    }

    // Convert finish reason
    claudeResponse.stop_reason = convertFinishReasonToClaude(
      choice.finish_reason,
    );
  }

  // If no content was added, add an empty text block
  if (claudeResponse.content.length === 0) {
    claudeResponse.content.push({
      type: "text",
      text: "",
    });
  }

  // Add web search usage if available
  if (
    openAIResponse.usage?.web_search_count &&
    openAIResponse.usage.web_search_count > 0
  ) {
    claudeResponse.usage.server_tool_use = {
      web_search_requests: openAIResponse.usage.web_search_count,
    };
  }

  return claudeResponse;
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
    input_tokens: usage.prompt_tokens || 0,
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

/**
 * Convert OpenAI finish reason to Claude stop reason
 */
function convertFinishReasonToClaude(finishReason: string): string {
  switch (finishReason) {
    case "stop":
      return CLAUDE_STOP_REASONS.END_TURN;
    case "length":
      return CLAUDE_STOP_REASONS.MAX_TOKENS;
    case "tool_calls":
      return CLAUDE_STOP_REASONS.TOOL_USE;
    case "content_filter":
      return CLAUDE_STOP_REASONS.STOP_SEQUENCE;
    default:
      return finishReason || CLAUDE_STOP_REASONS.END_TURN;
  }
}

/**
 * Stream state for tracking conversion progress
 */
interface StreamConversionState {
  messageId: string;
  sentMessageStart: boolean;
  currentContentIndex: number;
  currentContentType: string | null;
  contentTexts: string[];
  thinkingTexts: string[];
  toolCalls: Array<{
    index: number;
    id: string;
    name: string;
    input: string;
  }>;
}

/**
 * Convert OpenAI streaming response to Claude streaming responses
 * This returns an array of Claude stream events
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
        stop_reason: CLAUDE_STOP_REASONS.END_TURN,
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
      if (state.currentContentType !== CLAUDE_CONTENT_TYPES.TEXT) {
        // Close previous block
        if (
          state.currentContentIndex >= 0 &&
          state.currentContentType !== CLAUDE_CONTENT_TYPES.THINKING
        ) {
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

        // Initialize tool call if new
        if (!state.toolCalls[idx]) {
          // Close previous block
          if (
            state.currentContentIndex >= 0 &&
            state.currentContentType !== CLAUDE_CONTENT_TYPES.THINKING
          ) {
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

          events.push({
            type: CLAUDE_STREAM_TYPES.CONTENT_BLOCK_START,
            index: state.currentContentIndex,
            content_block: {
              type: CLAUDE_CONTENT_TYPES.TOOL_USE,
              id: state.toolCalls[idx].id,
              name: state.toolCalls[idx].name,
              input: {},
            },
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
  };
}

/**
 * ============================================================================
 * Error Conversion: OpenAI → Claude
 * ============================================================================
 */

/**
 * Convert OpenAI error type to Claude error type
 */
function convertOpenAIErrorTypeToClaude(openAIType: string): string {
  switch (openAIType) {
    case "invalid_request_error":
      return "invalid_request_error";
    case "authentication_error":
      return "authentication_error";
    case "permission_error":
      return "permission_error";
    case "not_found_error":
      return "not_found_error";
    case "request_too_large":
      return "request_too_large";
    case "rate_limit_error":
      return "rate_limit_error";
    case "api_error":
      return "api_error";
    case "overloaded_error":
      return "overloaded_error";
    default:
      return openAIType;
  }
}

/**
 * Convert OpenAI error response to Claude error response
 */
export function convertOpenAIErrorToClaude(
  openAIError: OpenAIErrorResponse,
): ClaudeErrorResponse {
  return {
    type: "error",
    error: {
      type: convertOpenAIErrorTypeToClaude("api_error"),
      message: openAIError[0].error.message || "Unknown error",
    },
  };
}

/**
 * Handle HTTP error response from OpenAI API
 * This function reads the error response body and converts it to Claude format
 */
export async function handleOpenAIErrorResponse(
  response: Response,
): Promise<ClaudeErrorResponse> {
  const contentType = response.headers.get("content-type");

  // Try to parse as JSON error
  if (contentType && contentType.includes("application/json")) {
    try {
      const openAIError = (await response.json()) as OpenAIErrorResponse;
      console.log("openAIError: ", openAIError);
      return convertOpenAIErrorToClaude(openAIError);
    } catch (e) {
      // If parsing fails, return generic error
      return {
        type: "error",
        error: {
          type: "api_error",
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }
  }

  // Non-JSON error response
  return {
    type: "error",
    error: {
      type: "api_error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    },
  };
}
