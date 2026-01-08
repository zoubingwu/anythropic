export interface ClaudeCacheControl {
  type: "ephemeral";
  ttl?: string;
}

export interface ClaudeImageSource {
  type: "base64" | "url";
  media_type?: string;
  data?: string;
  url?: string;
}

export interface ClaudeContent {
  type:
    | "text"
    | "thinking"
    | "tool_use"
    | "tool_result"
    | "image"
    | "server_tool_use"
    | "web_search_tool_result";
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

export interface ClaudeToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

export interface ClaudeAnyContentMessage {
  role: "user" | "assistant";
  content: string | ClaudeContent[] | any;
  cache_control?: ClaudeCacheControl;
  tool_calls?: ClaudeToolCall[];
}

export interface ClaudeInputSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  $schema?: string;
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
  inputSchema?: { json: ClaudeInputSchema }; // For Kiro compatibility
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
  metadata?: Record<string, any>;
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
  service_tier?: string;
  prompt_tokens?: number;
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
    | string
    | null;
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
  stop_sequence?: string | null;
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
  param?: string;
  code?: string;
}

export interface ClaudeErrorResponse {
  type: "error";
  error: ClaudeError;
}
