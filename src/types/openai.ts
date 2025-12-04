export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  thinking?: {
    content: string;
    signature?: string;
  };
}

type OpenAIErrorFromGemini = {
  code: number;
  message: string;
  status: string;
};

export type OpenAIError = {
  message: string;
  type: string;
  param: string;
  code: string;
};

export type OpenAIErrorResponse =
  | {
      error: OpenAIErrorFromGemini;
    }[]
  | {
      error: OpenAIError;
    };

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

export interface OpenAIChatCompletionsResponse {
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
      annotations?: Annotation[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | string;
  }>;
  usage?: ChatUsage;
}

export interface Annotation {
  url_citation: {
    title: string;
    url: string;
  };
}

export interface OpenAIChatCompletionsStreamResponse {
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
