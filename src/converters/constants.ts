export const CLAUDE_CONTENT_TYPES = {
  TEXT: "text",
  THINKING: "thinking",
  TOOL_USE: "tool_use",
  TOOL_RESULT: "tool_result",
  IMAGE: "image",
  SERVER_TOOL_USE: "server_tool_use",
  WEB_SEARCH_TOOL_RESULT: "web_search_tool_result",
} as const;

export const CLAUDE_STOP_REASONS = {
  END_TURN: "end_turn",
  MAX_TOKENS: "max_tokens",
  TOOL_USE: "tool_use",
  STOP_SEQUENCE: "stop_sequence",
} as const;

export const CLAUDE_STREAM_TYPES = {
  MESSAGE_START: "message_start",
  MESSAGE_DELTA: "message_delta",
  MESSAGE_STOP: "message_stop",
  CONTENT_BLOCK_START: "content_block_start",
  CONTENT_BLOCK_DELTA: "content_block_delta",
  CONTENT_BLOCK_STOP: "content_block_stop",
  PING: "ping",
} as const;

export const CLAUDE_DELTA_TYPES = {
  TEXT_DELTA: "text_delta",
  THINKING_DELTA: "thinking_delta",
  SIGNATURE_DELTA: "signature_delta",
  INPUT_JSON_DELTA: "input_json_delta",
} as const;

export const OPENAI_FINISH_REASONS = {
  STOP: "stop",
  LENGTH: "length",
  TOOL_CALLS: "tool_calls",
  CONTENT_FILTER: "content_filter",
} as const;
