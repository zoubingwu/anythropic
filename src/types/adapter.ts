import {
  ClaudeAnyContentRequest,
  ClaudeErrorResponse,
  ClaudeResponse,
  ClaudeStreamResponse,
} from "./claude";
import { StreamConversionState } from "./conversion";
import {
  OpenAIChatCompletionsResponse,
  OpenAIChatCompletionsStreamResponse,
  OpenAIRequest,
} from "./openai";

export interface ModelAdapter {
  readonly provider: string;
  readonly baseUrl: string;

  transformRequest(claudeRequest: ClaudeAnyContentRequest): OpenAIRequest;

  transformResponse(
    openaiResponse: OpenAIChatCompletionsResponse,
  ): ClaudeResponse;

  transformStreamResponse(
    openaiChunk: OpenAIChatCompletionsStreamResponse,
    state: StreamConversionState,
  ): ClaudeStreamResponse[];

  transformError(error: any): ClaudeErrorResponse;

  transformHttpError(response: Response): Promise<ClaudeErrorResponse>;

  handleStreamResponse(c: any, openAIResponse: Response): Promise<any>;

  getAuthHeaders(apiKey: string): Promise<Record<string, string>>;

  getCompletionPath(): string;
}
