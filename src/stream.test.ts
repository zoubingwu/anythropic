import { describe, it, expect } from 'vitest'
import {
  ClaudeToOpenAIConverterState,
  OpenAIToClaudeConverterState,
  createClaudeToOpenAIState,
  createOpenAIToClaudeState,
  convertClaudeToOpenAIChunk,
  convertOpenAIToClaudeChunk,
} from './stream'
import { ClaudeStreamResponse, OpenAIStreamChunk } from './types'

describe('Stream Conversion Tests', () => {
  describe('Claude to OpenAI State', () => {
    it('should create initial state', () => {
      const state = createClaudeToOpenAIState()
      expect(state.messageId).toBe('')
    })

    it('should update messageId on message_start', () => {
      const state = createClaudeToOpenAIState()
      const chunk: ClaudeStreamResponse = {
        type: 'message_start',
        message: { id: 'msg_123', model: 'claude-3-5-sonnet' },
      }

      const result = convertClaudeToOpenAIChunk(state, chunk)

      expect(state.messageId).toBe('msg_123')
      expect(result).not.toBeNull()
      expect(result!.choices[0].delta.role).toBe('assistant')
    })

    it('should convert text content', () => {
      const state = createClaudeToOpenAIState()
      state.messageId = 'msg_123'

      const chunk: ClaudeStreamResponse = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello world' },
        index: 0,
      }

      const result = convertClaudeToOpenAIChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result!.choices[0].delta.content).toBe('Hello world')
    })

    it('should start tool call', () => {
      const state = createClaudeToOpenAIState()
      state.messageId = 'msg_123'

      const chunk: ClaudeStreamResponse = {
        type: 'content_block_start',
        content_block: {
          type: 'tool_use',
          id: 'tool_123',
          name: 'get_weather',
          input: {},
        },
        index: 0,
      }

      const result = convertClaudeToOpenAIChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result!.choices[0].delta.tool_calls).toBeDefined()
      expect(result!.choices[0].delta.tool_calls![0].id).toBe('tool_123')
      expect(result!.choices[0].delta.tool_calls![0].function.name).toBe('get_weather')
    })

    it('should update tool call arguments', () => {
      const state = createClaudeToOpenAIState()
      state.messageId = 'msg_123'

      const chunk: ClaudeStreamResponse = {
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '{"location": "SF"}' },
        index: 0,
      }

      const result = convertClaudeToOpenAIChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result!.choices[0].delta.tool_calls).toBeDefined()
      expect(result!.choices[0].delta.tool_calls![0].function.arguments).toBe('{"location": "SF"}')
    })

    it('should handle message completion', () => {
      const state = createClaudeToOpenAIState()
      state.messageId = 'msg_123'

      const chunk: ClaudeStreamResponse = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { input_tokens: 10, output_tokens: 20 },
      }

      const result = convertClaudeToOpenAIChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result!.choices[0].finish_reason).toBe('stop')
      expect(result!.usage).toBeDefined()
      expect(result!.usage!.prompt_tokens).toBe(10)
    })
  })

  describe('OpenAI to Claude State', () => {
    it('should create initial state', () => {
      const state = createOpenAIToClaudeState()
      expect(state.pendingToolCalls.size).toBe(0)
    })

    it('should handle assistant role start', () => {
      const state = createOpenAIToClaudeState()
      const chunk: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: undefined,
        }],
      }

      const result = convertOpenAIToClaudeChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result).toContain('message_start')
      expect(result).toContain('assistant')
    })

    it('should handle text content', () => {
      const state = createOpenAIToClaudeState()
      const chunk: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Hello world' },
          finish_reason: undefined,
        }],
      }

      const result = convertOpenAIToClaudeChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result).toContain('text_delta')
      expect(result).toContain('Hello world')
    })

    it('should start tool call', () => {
      const state = createOpenAIToClaudeState()
      const chunk: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_123',
              type: 'function',
              function: { name: 'get_weather', arguments: '' },
            }],
          },
          finish_reason: undefined,
        }],
      }

      const result = convertOpenAIToClaudeChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result).toContain('content_block_start')
      expect(result).toContain('tool_use')
      expect(result).toContain('get_weather')
      expect(state.pendingToolCalls.has(0)).toBe(true)
    })

    it('should update tool call arguments', () => {
      const state = createOpenAIToClaudeState()
      // Setup pending tool call
      state.pendingToolCalls.set(0, {
        id: 'call_123',
        name: 'get_weather',
        arguments: '',
      })

      const chunk: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_001',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"location": "SF"}' },
            }],
          },
          finish_reason: undefined,
        }],
      }

      const result = convertOpenAIToClaudeChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result).toContain('input_json_delta')
      // JSON.stringify will escape quotes, so check for the escaped version
      expect(result).toContain('\\"location\\"')
      expect(result).toContain('SF')
      expect(state.pendingToolCalls.get(0)?.arguments).toBe('{"location": "SF"}')
    })

    it('should handle finish reason', () => {
      const state = createOpenAIToClaudeState()
      const chunk: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
      }

      const result = convertOpenAIToClaudeChunk(state, chunk)

      expect(result).not.toBeNull()
      expect(result).toContain('message_delta')
      expect(result).toContain('end_turn')
    })

    it('should cleanup on finish', () => {
      const state = createOpenAIToClaudeState()
      state.pendingToolCalls.set(0, {
        id: 'call_123',
        name: 'get_weather',
        arguments: '{}',
      })

      const chunk: OpenAIStreamChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'tool_calls',
        }],
      }

      convertOpenAIToClaudeChunk(state, chunk)

      expect(state.pendingToolCalls.size).toBe(0)
    })
  })
})
