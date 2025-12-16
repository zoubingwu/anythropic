import { describe, expect, it } from "vitest";
import { ClaudeAnyContentRequest } from "../types/claude";
import { StreamConversionState } from "../types/conversion";
import {
  OpenAIChatCompletionsResponse,
  OpenAIChatCompletionsStreamResponse,
} from "../types/openai";
import { CLAUDE_CONTENT_TYPES, CLAUDE_STOP_REASONS } from "./constants";
import { convertClaudeRequestToOpenAI } from "./request";
import { convertOpenAINonStreamToClaude } from "./response";
import {
  convertOpenAIStreamToClaude,
  createStreamState,
  getFinalStreamEvents,
} from "./stream";

describe("converter e2e mocks", () => {
  it("converts Claude request into OpenAI request types", () => {
    const claudeRequest: ClaudeAnyContentRequest = {
      model: "claude-3",
      stream: true,
      system: [
        {
          type: "text",
          text: "keep concise",
        },
      ],
      max_completion_tokens: 32,
      temperature: 0.3,
      top_p: 0.9,
      stop_sequences: ["done"],
      tool_choice: "any",
      tools: [
        {
          name: "lookup",
          description: "search",
          input_schema: {
            type: "object",
            properties: {
              q: { type: "string" },
            },
            required: ["q"],
          },
        },
      ],
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "step 1" },
            {
              type: "image",
              source: { type: "base64", data: "abc", media_type: "image/png" },
            },
            {
              type: "thinking",
              thinking: "chain",
              signature: "sig-123",
            },
            {
              type: "tool_use",
              id: "tool-1",
              name: "lookup",
              input: { q: "foo" },
              signature: "sig-123",
            },
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: "ok",
            },
          ],
        },
      ],
    };

    const result = convertClaudeRequestToOpenAI(claudeRequest);

    expect(result).toMatchObject({
      model: "claude-3",
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 32,
      temperature: 0.3,
      top_p: 0.9,
      stop: ["done"],
      tool_choice: "required",
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "search",
            parameters: {
              type: "object",
              properties: { q: { type: "string" } },
              required: ["q"],
            },
          },
        },
      ],
    });

    expect(typeof result.model).toBe("string");
    expect(result.stream).toBe(true);
    expect(result.stream_options?.include_usage).toBe(true);
    expect(result.max_completion_tokens).toBe(32);
    expect(result.temperature).toBe(0.3);
    expect(result.top_p).toBe(0.9);
    expect(result.stop).toEqual(["done"]);
    expect(result.tool_choice).toBe("required");
    expect(result.tools?.length).toBe(1);
    expect(result.messages).toHaveLength(3);

    expect(result.messages[0]).toEqual({
      role: "system",
      content: [
        {
          type: "text",
          text: "keep concise",
        },
      ],
    });

    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[1].tool_calls?.length).toBe(1);
    expect(result.messages[1].content).toEqual([
      { type: "text", text: "step 1" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    ]);
    expect(result.messages[1].thinking).toEqual({
      content: "chain",
      signature: "sig-123",
    });
    expect(result.messages[1].tool_calls?.[0]).toMatchObject({
      id: "tool-1",
      type: "function",
      function: {
        name: "lookup",
        arguments: '{"q":"foo"}',
      },
      extra_content: {
        google: {
          thought_signature: "sig-123",
        },
      },
    });

    expect(result.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "tool-1",
      content: "ok",
    });
    expect(result.messages[2].content).toBe("ok");
  });

  it("converts OpenAI response into Claude response types", () => {
    const openAIResponse: OpenAIChatCompletionsResponse = {
      id: "abc",
      object: "chat.completion",
      created: 1,
      model: "gpt-4.1",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: "answer",
            reasoning_content: "reason here",
            annotations: [
              {
                url_citation: { title: "t", url: "https://example.com" },
              },
            ],
            tool_calls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "lookup",
                  arguments: '{"q":"bar"}',
                },
                extra_content: {
                  google: { thought_signature: "sig-999" },
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 12,
        total_tokens: 0,
        web_search_count: 2,
        prompt_tokens_details: {
          cached_tokens: 10,
          audio_tokens: 0,
          cache_creation_tokens: 2,
        },
        completion_tokens_details: {
          reasoning_tokens: 0,
          audio_tokens: 0,
          accepted_prediction_tokens: 0,
          rejected_prediction_tokens: 0,
        },
      },
    };

    const claudeResponse = convertOpenAINonStreamToClaude(openAIResponse);

    expect(claudeResponse).toMatchObject({
      type: "message",
      role: "assistant",
      model: "gpt-4.1",
      stop_reason: CLAUDE_STOP_REASONS.TOOL_USE,
      usage: {
        input_tokens: 90,
        output_tokens: 12,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 2,
        server_tool_use: {
          web_search_requests: 2,
        },
      },
    });

    expect(claudeResponse.id).toBeDefined();
    expect(claudeResponse.stop_sequence ?? null).toBeNull();
    expect(Array.isArray(claudeResponse.content)).toBe(true);

    const serverUse = claudeResponse.content[0];
    const webResult = claudeResponse.content[1];
    const thinking = claudeResponse.content[2];
    const text = claudeResponse.content[3];
    const toolUse = claudeResponse.content[4];

    expect(serverUse.type).toBe(CLAUDE_CONTENT_TYPES.SERVER_TOOL_USE);
    expect(serverUse.name).toBe("web_search");
    expect(serverUse.id).toBeDefined();

    expect(webResult.type).toBe(CLAUDE_CONTENT_TYPES.WEB_SEARCH_TOOL_RESULT);
    expect(webResult.tool_use_id).toBe(serverUse.id);
    expect(webResult.content?.[0]).toEqual({
      type: "web_search_result",
      url: "https://example.com",
      title: "t",
    });

    expect(thinking).toEqual({
      type: CLAUDE_CONTENT_TYPES.THINKING,
      thinking: "reason here",
      signature: "sig-999",
    });

    expect(text).toEqual({
      type: CLAUDE_CONTENT_TYPES.TEXT,
      text: "answer",
    });

    expect(toolUse).toEqual({
      type: CLAUDE_CONTENT_TYPES.TOOL_USE,
      id: "call-1",
      name: "lookup",
      input: { q: "bar" },
      signature: "sig-999",
    });
    expect(claudeResponse.usage.server_tool_use?.web_search_requests).toBe(2);
    expect(claudeResponse.usage.cache_read_input_tokens).toBe(10);
    expect(claudeResponse.usage.cache_creation_input_tokens).toBe(2);
  });

  it("converts OpenAI stream chunks into Claude stream events", () => {
    const state: StreamConversionState = createStreamState();

    const chunk1: OpenAIChatCompletionsStreamResponse = {
      id: "s1",
      object: "chat.completion.chunk",
      created: 1,
      model: "gpt-4.1-mini",
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            reasoning_content: "think-",
          },
        },
      ],
    };

    const chunk2: OpenAIChatCompletionsStreamResponse = {
      id: "s1",
      object: "chat.completion.chunk",
      created: 2,
      model: "gpt-4.1-mini",
      choices: [
        {
          index: 0,
          delta: {
            content: "hello ",
          },
        },
      ],
    };

    const chunk3: OpenAIChatCompletionsStreamResponse = {
      id: "s1",
      object: "chat.completion.chunk",
      created: 3,
      model: "gpt-4.1-mini",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                id: "call-1",
                index: 0,
                type: "function",
                function: {
                  name: "lookup",
                  arguments: '{"a":',
                },
                extra_content: {
                  google: {
                    thought_signature: "sig-stream",
                  },
                },
              },
            ],
          },
        },
      ],
    };

    const chunk4: OpenAIChatCompletionsStreamResponse = {
      id: "s1",
      object: "chat.completion.chunk",
      created: 4,
      model: "gpt-4.1-mini",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                id: "call-1",
                index: 0,
                type: "function",
                function: {
                  name: "lookup",
                  arguments: "1}",
                },
              },
            ],
          },
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 7,
        total_tokens: 12,
        prompt_tokens_details: {
          cached_tokens: 2,
          audio_tokens: 0,
          cache_creation_tokens: 1,
        },
        completion_tokens_details: {
          reasoning_tokens: 0,
          audio_tokens: 0,
          accepted_prediction_tokens: 0,
          rejected_prediction_tokens: 0,
        },
      },
    };

    const events1 = convertOpenAIStreamToClaude(chunk1, state);
    const events2 = convertOpenAIStreamToClaude(chunk2, state);
    const events3 = convertOpenAIStreamToClaude(chunk3, state);
    const events4 = convertOpenAIStreamToClaude(chunk4, state);
    const finalEvents = getFinalStreamEvents(state, chunk4.usage);

    const all = [
      ...events1,
      ...events2,
      ...events3,
      ...events4,
      ...finalEvents,
    ];

    const start = all[0];
    expect(start.type).toBe("message_start");
    expect(start.message?.model).toBe("gpt-4.1-mini");
    expect(all[1].type).toBe("ping");

    const thinkingStart = all.find(
      (e) =>
        e.type === "content_block_start" &&
        e.content_block?.type === CLAUDE_CONTENT_TYPES.THINKING,
    );
    const thinkingDelta = all.find(
      (e) => e.type === "content_block_delta" && e.delta?.thinking === "think-",
    );
    expect(thinkingStart).toBeDefined();
    expect(thinkingDelta).toBeDefined();

    const textStart = all.find(
      (e) =>
        e.type === "content_block_start" &&
        e.content_block?.type === CLAUDE_CONTENT_TYPES.TEXT,
    );
    const textDelta = all.find(
      (e) => e.type === "content_block_delta" && e.delta?.text === "hello ",
    );
    expect(textStart).toBeDefined();
    expect(textDelta).toBeDefined();

    const toolStart = all.find(
      (e) =>
        e.type === "content_block_start" &&
        e.content_block?.type === CLAUDE_CONTENT_TYPES.TOOL_USE,
    );
    const toolDeltaJson = all.filter(
      (e) => e.type === "content_block_delta" && e.delta?.partial_json,
    );
    expect(toolStart?.content_block?.id).toBe("call-1");
    expect(toolStart?.content_block?.signature).toBe("sig-stream");
    expect(toolDeltaJson.map((e) => e.delta?.partial_json).join("")).toBe(
      '{"a":1}',
    );

    const messageDelta = all.find((e) => e.type === "message_delta");
    expect(messageDelta?.delta?.stop_reason).toBe(CLAUDE_STOP_REASONS.END_TURN);
    expect(messageDelta?.usage?.input_tokens).toBe(3);
    expect(messageDelta?.usage?.output_tokens).toBe(7);
    expect(messageDelta?.usage?.cache_read_input_tokens).toBe(2);
    expect(messageDelta?.usage?.cache_creation_input_tokens).toBe(1);

    const messageStop = all[all.length - 1];
    expect(messageStop.type).toBe("message_stop");
  });
});
