import {
  ClaudeContent,
  ClaudeMessage,
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamResponse,
  OpenAIMessage,
  OpenAIRequest,
  OpenAIStreamChunk,
} from "./types";

// ============================================================================
// OpenAI → Claude Conversion
// ============================================================================

export function convertOpenAIMessageToClaude(msg: OpenAIMessage): {
  role: "user" | "assistant";
  content: ClaudeContent[];
} {
  const content: ClaudeContent[] = [];

  // Handle tool calls (assistant role)
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    msg.tool_calls.forEach((toolCall) => {
      content.push({
        type: "tool_use",
        id: toolCall.id,
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments),
      });
    });
  }

  // Handle regular content
  if (msg.content) {
    if (typeof msg.content === "string") {
      content.push({ type: "text", text: msg.content });
    } else if (Array.isArray(msg.content)) {
      msg.content.forEach((part) => {
        if (part.type === "text") {
          content.push({ type: "text", text: part.text || "" });
        }
      });
    }
  }

  // Handle tool results (tool role)
  if (msg.role === "tool" && msg.tool_call_id) {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: msg.tool_call_id,
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        },
      ],
    };
  }

  return {
    role: msg.role === "assistant" ? "assistant" : "user",
    content,
  };
}

export function convertOpenAIRequestToClaude(
  request: OpenAIRequest,
): ClaudeRequest {
  const claudeRequest: ClaudeRequest = {
    model: request.model,
    messages: [],
    max_tokens: request.max_tokens || 4096,
    temperature: request.temperature,
    top_p: request.top_p,
    stream: request.stream || false,
  };

  // Extract system messages
  const systemMessages: Array<{ type: "text"; text: string }> = [];
  const userMessages: OpenAIMessage[] = [];

  request.messages.forEach((msg) => {
    if (msg.role === "system") {
      systemMessages.push({
        type: "text",
        text: typeof msg.content === "string" ? msg.content : "",
      });
    } else {
      userMessages.push(msg);
    }
  });

  if (systemMessages.length > 0) {
    claudeRequest.system = systemMessages;
  }

  // Convert remaining messages
  claudeRequest.messages = userMessages.map(convertOpenAIMessageToClaude);

  // Convert tools
  if (request.tools && request.tools.length > 0) {
    claudeRequest.tools = request.tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters as any,
    }));
  }

  if (request.tool_choice !== undefined) {
    claudeRequest.tool_choice = request.tool_choice;
  }

  return claudeRequest;
}

// ============================================================================
// Claude → OpenAI Conversion
// ============================================================================

export function convertClaudeMessageToOpenAI(
  msg: ClaudeMessage,
): OpenAIMessage {
  const toolCalls: OpenAIMessage["tool_calls"] = [];
  let textContent = "";

  if (Array.isArray(msg.content)) {
    msg.content.forEach((block) => {
      if (block.type === "text") {
        textContent += block.text || "";
      } else if (block.type === "tool_use") {
        toolCalls!.push({
          id: block.id || "",
          type: "function",
          function: {
            name: block.name || "",
            arguments: JSON.stringify(block.input || {}),
          },
        });
      }
    });
  } else if (typeof msg.content === "string") {
    textContent = msg.content;
  }

  return {
    role: msg.role,
    content: textContent || "",
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export function convertClaudeRequestToOpenAI(
  request: ClaudeRequest,
): OpenAIRequest {
  const messages: OpenAIMessage[] = [];

  // Add system messages
  if (request.system && request.system.length > 0) {
    request.system.forEach((sysMsg) => {
      messages.push({
        role: "system",
        content: sysMsg.text,
      });
    });
  }

  // Add user/assistant messages
  messages.push(...request.messages.map(convertClaudeMessageToOpenAI));

  const openaiRequest: OpenAIRequest = {
    model: request.model,
    messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stream: request.stream,
  };

  // Convert tools
  if (request.tools && request.tools.length > 0) {
    openaiRequest.tools = request.tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  return openaiRequest;
}

// ============================================================================
// Response Conversion
// ============================================================================

export function convertClaudeResponseToOpenAI(
  claudeResponse: ClaudeResponse,
): any {
  return {
    id: claudeResponse.id,
    object: "chat.completion",
    created: Date.now(),
    model: claudeResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: claudeResponse.content?.[0]?.text || "",
        },
        finish_reason: claudeResponse.stop_reason || "stop",
      },
    ],
    usage: {
      prompt_tokens: claudeResponse.usage.input_tokens,
      completion_tokens: claudeResponse.usage.output_tokens,
      total_tokens: claudeResponse.usage.total_tokens,
    },
  };
}

export function convertOpenAIResponseToClaude(
  openaiResponse: any,
): ClaudeResponse {
  const choice = openaiResponse.choices?.[0];
  return {
    id: openaiResponse.id,
    role: "assistant",
    model: openaiResponse.model,
    content: openaiResponse.choices?.[0]?.message?.content
      ? [{ type: "text", text: openaiResponse.choices[0].message.content }]
      : [],
    stop_reason: openaiResponse.choices?.[0]?.finish_reason,
    usage: {
      input_tokens: openaiResponse.usage?.prompt_tokens || 0,
      output_tokens: openaiResponse.usage?.completion_tokens || 0,
      total_tokens: openaiResponse.usage?.total_tokens || 0,
    },
  };
}
