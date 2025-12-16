import {
  ClaudeAnyContentMessage,
  ClaudeAnyContentRequest,
  ClaudeContent,
  ClaudeTool,
} from "../types/claude";
import {
  MessageContent,
  OpenAIMessage,
  OpenAIRequest,
  Tool,
  ToolCall,
} from "../types/openai";
import { CLAUDE_CONTENT_TYPES } from "./constants";

interface ConvertedContent {
  content?: string | MessageContent[] | null;
  toolCalls?: ToolCall[];
  toolMessages?: OpenAIMessage[];
  thinking?: {
    content: string;
    signature?: string;
  };
}

export function convertClaudeRequestToOpenAI(
  claudeRequest: ClaudeAnyContentRequest,
): OpenAIRequest {
  const openAIRequest: OpenAIRequest = {
    model: claudeRequest.model,
    messages: [],
    stream: claudeRequest.stream,
  };

  if (claudeRequest.max_tokens !== undefined) {
    openAIRequest.max_completion_tokens = claudeRequest.max_tokens;
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

  if (claudeRequest.tools && claudeRequest.tools.length > 0) {
    openAIRequest.tools = convertClaudeToolsToOpenAI(claudeRequest.tools);
    openAIRequest.tool_choice = convertClaudeToolChoiceToOpenAI(
      claudeRequest.tool_choice,
    );
  }

  if (claudeRequest.stop_sequences && claudeRequest.stop_sequences.length > 0) {
    openAIRequest.stop = claudeRequest.stop_sequences;
  }

  if (claudeRequest.stream) {
    openAIRequest.stream_options = {
      include_usage: true,
    };
  }

  if (claudeRequest.system && claudeRequest.system.length > 0) {
    const systemMessages = convertClaudeSystemToOpenAI(claudeRequest.system);
    openAIRequest.messages.push(...systemMessages);
  }

  const convertedMessages = convertClaudeMessagesToOpenAI(
    claudeRequest.messages,
  );
  openAIRequest.messages.push(...convertedMessages);

  return openAIRequest;
}

function convertClaudeSystemToOpenAI(system: ClaudeContent[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  if (system.length > 0) {
    const content: MessageContent[] = [];

    for (const item of system) {
      if (item.type === "text" && item.text) {
        content.push({
          type: "text",
          text: item.text,
        });
      }
    }

    if (content.length > 0) {
      messages.push({
        role: "system",
        content,
      });
    }
  }

  return messages;
}

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

      const hasToolCalls =
        result.toolCalls && result.toolCalls.length > 0 ? true : false;
      const hasContent =
        (result.content && result.content.length > 0) ||
        (result.toolCalls && result.toolCalls.length > 0);
      const hasToolMessages =
        result.toolMessages && result.toolMessages.length > 0 ? true : false;

      // Ensure tool call responses are placed immediately after the tool call step.
      // For Claude payloads that bundle tool_result and new user text in the same message,
      // we emit the tool messages first so Copilot/OpenAI validation sees the expected order.
      if (hasToolMessages && !hasToolCalls) {
        openAIMessages.push(...result.toolMessages!);
      }

      if (hasContent) {
        const message: OpenAIMessage = {
          role: msg.role as "user" | "assistant",
          content: result.content,
          tool_calls: result.toolCalls,
        };

        if (result.thinking) {
          message.thinking = result.thinking;
          if (
            result.thinking.signature &&
            result.toolCalls &&
            result.toolCalls.length > 0
          ) {
            if (!result.toolCalls[0].extra_content?.google?.thought_signature) {
              result.toolCalls[0].extra_content = {
                google: {
                  thought_signature: result.thinking.signature,
                },
              };
            }
          }
        }
        openAIMessages.push(message);
      }

      if (hasToolMessages && hasToolCalls) {
        openAIMessages.push(...result.toolMessages!);
      }
    }
  }

  return openAIMessages;
}

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
      case CLAUDE_CONTENT_TYPES.TEXT:
        if (content.text) {
          messageContents.push({
            type: "text",
            text: content.text,
          });
        }
        break;

      case CLAUDE_CONTENT_TYPES.THINKING:
        if (content.thinking) {
          result.thinking = {
            content: content.thinking,
            signature: content.signature,
          };
        }
        break;

      case CLAUDE_CONTENT_TYPES.IMAGE:
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

      case CLAUDE_CONTENT_TYPES.TOOL_USE:
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

      case CLAUDE_CONTENT_TYPES.TOOL_RESULT:
        let toolContent: string | MessageContent[] | null = null;
        if (typeof content.content === "string") {
          toolContent = content.content;
        } else if (Array.isArray(content.content)) {
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
