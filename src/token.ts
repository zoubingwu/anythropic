import { ClaudeAnyContentMessage, ClaudeContent, ClaudeTool } from "./types";

/**
 * Heuristic token estimation: ~4 chars per token with adjustments for Unicode/punctuation/code
 */
const estimateTokens = (text: string): number => {
  if (!text || text.length === 0) return 0;

  let charCount = 0;
  let unicodeCount = 0;
  let punctuationCount = 0;

  for (const char of text) {
    charCount++;
    if (char.charCodeAt(0) > 127) unicodeCount++;
    if (/[.,!?;:'"(){}[\]]/.test(char)) punctuationCount++;
  }

  let tokens = Math.ceil(charCount / 4);
  tokens += Math.ceil(unicodeCount * 0.5);
  tokens += Math.ceil(punctuationCount * 0.3);

  const words = text.split(/\s+/).filter((word) => word.length > 0).length;
  tokens = Math.max(tokens, words);

  const specialChars = (text.match(/[<>}")/[\]]/g) || []).length;
  tokens += Math.ceil(specialChars * 0.2);

  return Math.ceil(tokens * 1.1); // 10% safety margin
};

const countClaudeContentTokens = (content: ClaudeContent): number => {
  let tokens = 0;

  switch (content.type) {
    case "text":
    case "thinking":
      tokens += estimateTokens(content.text || content.thinking || "");
      break;

    case "tool_use":
      tokens += 8; // tool call overhead
      tokens += estimateTokens(content.name || "");
      if (content.input)
        tokens += estimateTokens(JSON.stringify(content.input));
      break;

    case "tool_result":
      tokens += 6; // tool result overhead
      if (content.content) {
        if (typeof content.content === "string") {
          tokens += estimateTokens(content.content);
        } else if (Array.isArray(content.content)) {
          for (const item of content.content) {
            tokens +=
              typeof item === "string"
                ? estimateTokens(item)
                : estimateTokens(JSON.stringify(item));
          }
        } else {
          tokens += estimateTokens(JSON.stringify(content.content));
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

const countClaudeMessageTokens = (message: ClaudeAnyContentMessage): number => {
  let tokens = 4; // role overhead

  if (typeof message.content === "string") {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const content of message.content) {
      tokens += countClaudeContentTokens(content);
    }
  } else {
    tokens += estimateTokens(JSON.stringify(message.content));
  }

  return tokens;
};

// Model-specific token adjustments based on tokenizer efficiency
const adjustTokensByModel = (tokens: number, model: string): number => {
  const cleanModel = model.toLowerCase();

  if (cleanModel.includes("claude")) return Math.ceil(tokens * 3.5);
  if (cleanModel.includes("gpt-4")) return Math.ceil(tokens * 4.0);
  if (cleanModel.includes("gpt-3.5")) return Math.ceil(tokens * 4.2);
  if (cleanModel.includes("gemini")) return Math.ceil(tokens * 3.8);

  return Math.ceil(tokens * 4.0);
};

export function countClaudeTokens(request: {
  model: string;
  messages: ClaudeAnyContentMessage[];
  system?: ClaudeContent[];
  tools?: ClaudeTool[];
}): number {
  let total = 0;

  if (request.system && request.system.length > 0) {
    for (const content of request.system) {
      total += countClaudeContentTokens(content);
    }
  }

  for (const message of request.messages) {
    total += countClaudeMessageTokens(message);
  }

  if (request.tools && request.tools.length > 0) {
    for (const tool of request.tools) {
      total += 10; // tool definition overhead
      total += estimateTokens(tool.name);
      if (tool.description) total += estimateTokens(tool.description);
      if (tool.input_schema)
        total += estimateTokens(JSON.stringify(tool.input_schema));
    }
  }

  return adjustTokensByModel(total, request.model);
}
