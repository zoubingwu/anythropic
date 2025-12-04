import { encodingForModel } from "js-tiktoken";
import { ClaudeAnyContentMessage, ClaudeContent, ClaudeTool } from "../types";

const getEncodingForModel = (modelName: string): string => {
  // Default to cl100k_base for all models
  return "cl100k_base";
};

const countClaudeContentTokens = (
  content: ClaudeContent,
  encoding: any,
): number => {
  let tokens = 0;

  switch (content.type) {
    case "text":
    case "thinking":
      tokens += encoding.encode(content.text || content.thinking || "").length;
      break;

    case "tool_use":
      tokens += 8; // tool call overhead
      tokens += encoding.encode(content.name || "").length;
      if (content.input)
        tokens += encoding.encode(JSON.stringify(content.input)).length;
      break;

    case "tool_result":
      tokens += 6; // tool result overhead
      if (content.content) {
        if (typeof content.content === "string") {
          tokens += encoding.encode(content.content).length;
        } else if (Array.isArray(content.content)) {
          for (const item of content.content) {
            tokens +=
              typeof item === "string"
                ? encoding.encode(item).length
                : encoding.encode(JSON.stringify(item)).length;
          }
        } else {
          tokens += encoding.encode(JSON.stringify(content.content)).length;
        }
      }
      break;

    case "image":
      tokens += 200; // image overhead
      if (content.source?.data) {
        tokens += Math.ceil(content.source.data.length / 1000);
      }
      break;

    default:
      tokens += 4;
  }

  return tokens;
};

const countClaudeMessageTokens = (
  message: ClaudeAnyContentMessage,
  encoding: any,
): number => {
  let tokens = 4; // role overhead

  if (typeof message.content === "string") {
    tokens += encoding.encode(message.content).length;
  } else if (Array.isArray(message.content)) {
    for (const content of message.content) {
      tokens += countClaudeContentTokens(content, encoding);
    }
  } else {
    tokens += encoding.encode(JSON.stringify(message.content)).length;
  }

  return tokens;
};

function countClaudeTokens(request: {
  model: string;
  messages: ClaudeAnyContentMessage[];
  system?: ClaudeContent[];
  tools?: ClaudeTool[];
}): number {
  let total = 0;

  const encodingName = getEncodingForModel(request.model);
  const encoding = encodingForModel(encodingName as any);

  if (request.system && request.system.length > 0) {
    for (const content of request.system) {
      total += countClaudeContentTokens(content, encoding);
    }
  }

  for (const message of request.messages) {
    total += countClaudeMessageTokens(message, encoding);
  }

  if (request.tools && request.tools.length > 0) {
    for (const tool of request.tools) {
      total += 10; // tool definition overhead
      total += encoding.encode(tool.name).length;
      if (tool.description) total += encoding.encode(tool.description).length;
      if (tool.input_schema)
        total += encoding.encode(JSON.stringify(tool.input_schema)).length;
    }
  }

  return total;
}

export const handleCountTokens = async (c: any) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.model || !body.messages) {
      return c.json({ error: "model and messages are required" }, 400);
    }

    // Calculate token count
    const tokenCount = countClaudeTokens({
      model: body.model,
      messages: body.messages,
      system: body.system,
      tools: body.tools,
    });

    // Return Claude format response
    return c.json({
      input_tokens: tokenCount,
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
};

export const handleCountTokensDetailed = async (c: any) => {
  const body = await c.req.json();

  const tokenCount = countClaudeTokens({
    model: body.model,
    messages: body.messages,
    system: body.system,
    tools: body.tools,
  });

  return c.json({
    input_tokens: tokenCount,
    model: body.model,
    message_count: body.messages?.length || 0,
    has_tools: !!body.tools,
    has_system: !!body.system,
  });
};
