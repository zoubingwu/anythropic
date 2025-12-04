import { ClaudeErrorResponse } from "../types/claude";
import { OpenAIErrorResponse } from "../types/openai";

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

export function convertOpenAIErrorToClaude(
  openAIError: OpenAIErrorResponse,
): ClaudeErrorResponse {
  if (Array.isArray(openAIError)) {
    return {
      type: "error",
      error: {
        type: convertOpenAIErrorTypeToClaude("api_error"),
        message: openAIError[0].error.message || "Unknown error",
      },
    };
  }

  return {
    type: "error",
    error: {
      type: convertOpenAIErrorTypeToClaude(
        openAIError.error.type || "api_error",
      ),
      message: openAIError.error.message || "Unknown error",
      param: openAIError.error.param || "",
      code: openAIError.error.code || "",
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

  if (contentType && contentType.includes("application/json")) {
    try {
      const openAIError = (await response.json()) as OpenAIErrorResponse;
      return convertOpenAIErrorToClaude(openAIError);
    } catch (e) {
      return {
        type: "error",
        error: {
          type: "api_error",
          message: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }
  } else if (contentType && contentType.includes("text/plain")) {
    const text = await response.text();
    return {
      type: "error",
      error: {
        type: "api_error",
        message: text,
      },
    };
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
