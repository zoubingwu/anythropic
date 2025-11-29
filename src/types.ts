// ============================================================================
// OpenAI Types
// ============================================================================

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }>;
  tool_calls?: Array<{
    index?: number;
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, any>;
    };
  }>;
  tool_choice?: any;
}

export interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<OpenAIMessage>;
    finish_reason?: string | undefined;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// Claude Types
// ============================================================================

export interface ClaudeContent {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: ClaudeContent[];
}

export interface ClaudeRequest {
  model: string;
  messages: ClaudeMessage[];
  system?: Array<{ type: "text"; text: string }>;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stream: boolean;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: {
      type: string;
      properties?: Record<string, any>;
      required?: string[];
    };
  }>;
  tool_choice?: any;
}

export interface ClaudeStreamResponse {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "message_delta"
    | "content_block_stop"
    | "message_stop";
  message?: any;
  content_block?: any;
  delta?: any;
  index?: number;
  usage?: { input_tokens: number; output_tokens: number;
    total_tokens?: number };
}

export interface ClaudeResponse {
  id: string;
  model: string;
  role: "assistant";
  content: ClaudeContent[];
  stop_reason?: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
}
