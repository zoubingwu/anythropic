import { ClaudeContent, ClaudeResponse, ClaudeUsage } from "../types/claude";
import { Annotation, ChatUsage, TextResponse } from "../types/openai";
import { CLAUDE_CONTENT_TYPES, CLAUDE_STOP_REASONS } from "./constants";

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

    if (message.annotations && message.annotations.length > 0) {
      const id = `srvtoolu_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`;
      claudeResponse.content.push({
        type: CLAUDE_CONTENT_TYPES.SERVER_TOOL_USE,
        id,
        name: "web_search",
        input: { query: "" },
      });
      claudeResponse.content.push({
        type: CLAUDE_CONTENT_TYPES.WEB_SEARCH_TOOL_RESULT,
        tool_use_id: id,
        content: message.annotations.map((item: Annotation) => {
          return {
            type: "web_search_result",
            url: item.url_citation.url,
            title: item.url_citation.title,
          };
        }),
      });
    }

    // Handle reasoning content (for o1 models)
    if (message.reasoning_content) {
      // Extract thought signature from first tool call for Gemini (to include in thinking block)
      const firstToolCallSignature =
        message.tool_calls?.[0]?.extra_content?.google?.thought_signature;

      claudeResponse.content.push({
        type: CLAUDE_CONTENT_TYPES.THINKING,
        thinking: message.reasoning_content,
        signature: firstToolCallSignature,
      });
    }

    // Handle text content
    if (message.content) {
      claudeResponse.content.push({
        type: CLAUDE_CONTENT_TYPES.TEXT,
        text: message.content,
      });
    }

    // Handle tool calls
    if (message.tool_calls) {
      for (let i = 0; i < message.tool_calls.length; i++) {
        const toolCall = message.tool_calls[i];
        let input: Record<string, any> = {};
        if (toolCall.function.arguments) {
          try {
            input = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            input = {};
          }
        }

        const content: ClaudeContent = {
          type: CLAUDE_CONTENT_TYPES.TOOL_USE,
          id: toolCall.id || "",
          name: toolCall.function.name,
          input: input,
        };

        // Preserve thought signature on tool_use block for Gemini
        // Only the first tool call in each step has a signature
        if (i === 0 && toolCall.extra_content?.google?.thought_signature) {
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
      type: CLAUDE_CONTENT_TYPES.TEXT,
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
 * FIX: Match LLMS implementation - subtract cached_tokens from input_tokens
 */
function convertOpenAIUsageToClaude(usage?: ChatUsage): ClaudeUsage {
  if (!usage) {
    return {
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  // FIX: Remove ...usage to avoid extraneous fields
  // FIX: input_tokens = prompt_tokens - cached_tokens (not just prompt_tokens)
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

  if (usage.web_search_count) {
    claudeUsage.server_tool_use = {
      web_search_requests: usage.web_search_count,
    };
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
