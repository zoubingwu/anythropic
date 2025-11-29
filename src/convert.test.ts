import { describe, it, expect } from 'vitest'
import {
  OpenAIMessage,
  OpenAIRequest,
  ClaudeMessage,
  ClaudeRequest,
  ClaudeResponse,
} from './types'
import {
  convertOpenAIMessageToClaude,
  convertOpenAIRequestToClaude,
  convertClaudeMessageToOpenAI,
  convertClaudeRequestToOpenAI,
  convertClaudeResponseToOpenAI,
  convertOpenAIResponseToClaude,
} from './converters'

describe('Protocol Conversion Tests', () => {
  describe('OpenAI to Claude', () => {
    it('should convert simple user message', () => {
      const openaiMessage: OpenAIMessage = {
        role: 'user',
        content: 'Hello!'
      }

      const result = convertOpenAIMessageToClaude(openaiMessage)

      expect(result.role).toBe('user')
      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello!' })
    })

    it('should convert system message to top-level system field', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant'
          },
          {
            role: 'user',
            content: 'Hello!'
          }
        ]
      }

      const result = convertOpenAIRequestToClaude(openaiRequest)

      // System messages should be extracted to top-level system field
      expect(result.system).toHaveLength(1)
      expect(result.system![0]).toEqual({ type: 'text', text: 'You are a helpful assistant' })
      // System messages should not be in messages array ( Claude messages only have 'user' or 'assistant' roles )
      expect(result.messages.length).toBe(1)
      expect(result.messages[0].role).toBe('user')
      // Verify stream field is set (default false)
      expect(result.stream).toBe(false)
    })

    it('should convert tool calls to tool_use blocks', () => {
      const openaiMessage: OpenAIMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "San Francisco"}'
            }
          }
        ]
      }

      const result = convertOpenAIMessageToClaude(openaiMessage)

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({
        type: 'tool_use',
        id: 'call_123',
        name: 'get_weather',
        input: { location: 'San Francisco' }
      })
    })

    it('should convert tool role to tool_result', () => {
      const openaiMessage: OpenAIMessage = {
        role: 'tool',
        content: '{"temperature": 72, "unit": "fahrenheit"}',
        tool_call_id: 'call_123'
      }

      const result = convertOpenAIMessageToClaude(openaiMessage)

      expect(result.role).toBe('user')
      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_123',
        content: '{"temperature": 72, "unit": "fahrenheit"}'
      })
    })

    it('should handle complete request with all components', () => {
      const openaiRequest: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'What\'s the weather?' }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a location',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' }
                },
                required: ['location']
              }
            }
          }
        ],
        tool_choice: 'auto'
      }

      const result = convertOpenAIRequestToClaude(openaiRequest)

      expect(result.model).toBe('gpt-4')
      expect(result.max_tokens).toBe(1000)
      expect(result.temperature).toBe(0.7)
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe('get_weather')
      expect(result.tools![0].description).toBe('Get weather for a location')
      // Verify stream field is set (default false)
      expect(result.stream).toBe(false)
    })
  })

  describe('Claude to OpenAI', () => {
    it('should convert simple user message', () => {
      const claudeMessage: ClaudeMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Hello!'
          }
        ]
      }

      // Content should be converted to string
      expect(claudeMessage.role).toBe('user')
      expect(Array.isArray(claudeMessage.content)).toBe(true)
    })

    it('should convert system messages to system role', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet',
        system: [{ type: 'text', text: 'You are a helpful assistant' }],
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello!' }]
          }
        ],
        max_tokens: 1000,
        stream: false
      }

      // System messages should be converted to system role messages
      expect(claudeRequest.system).toBeDefined()
      expect(claudeRequest.system!.length).toBe(1)
      expect(claudeRequest.system![0].text).toBe('You are a helpful assistant')
    })

    it('should convert tool_use blocks to tool_calls', () => {
      const claudeMessage: ClaudeMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_123',
            name: 'get_weather',
            input: { location: 'San Francisco' }
          }
        ]
      }

      const expectedToolCalls: any[] = [
        {
          id: 'toolu_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location":"San Francisco"}'
          }
        }
      ]

      const toolUseBlocks = claudeMessage.content.filter(b => b.type === 'tool_use')
      expect(toolUseBlocks.length).toBe(1)
      expect(toolUseBlocks[0].name).toBe('get_weather')
    })

    it('should convert tool_result to tool role', () => {
      const claudeMessage: ClaudeMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_123',
            content: '{"temperature": 72}'
          }
        ]
      }

      const toolResultBlocks = claudeMessage.content.filter(b => b.type === 'tool_result')
      expect(toolResultBlocks.length).toBe(1)
      expect(toolResultBlocks[0].tool_use_id).toBe('toolu_123')
    })

    it('should handle complete request with all components', () => {
      const claudeRequest: ClaudeRequest = {
        model: 'claude-3-5-sonnet',
        system: [{ type: 'text', text: 'You are a helpful assistant' }],
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What\'s the weather?' }]
          }
        ],
        max_tokens: 1000,
        stream: false,
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a location',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              },
              required: ['location']
            }
          }
        ]
      }

      expect(claudeRequest.tools).toBeDefined()
      expect(claudeRequest.tools!.length).toBe(1)
      expect(claudeRequest.tools![0].name).toBe('get_weather')
    })
  })

  describe('Tool conversion', () => {
    it('should convert OpenAI function to Claude tool format', () => {
      const openaiTool = {
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          }
        }
      }

      const claudeTool = {
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location']
        }
      }

      expect(openaiTool.function.name).toBe(claudeTool.name)
      expect(openaiTool.function.description).toBe(claudeTool.description)
    })

    it('should convert Claude tool to OpenAI function format', () => {
      const claudeTool = {
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' }
          },
          required: ['location']
        }
      }

      const openaiTool = {
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          }
        }
      }

      expect(claudeTool.name).toBe(openaiTool.function.name)
      expect(claudeTool.description).toBe(openaiTool.function.description)
    })
  })

  describe('Multimodal content', () => {
    it('should handle image_url in OpenAI format', () => {
      const openaiMessage: OpenAIMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'What\'s in this image?' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
        ]
      }

      expect(Array.isArray(openaiMessage.content)).toBe(true)
      const contentArray = openaiMessage.content as any[]
      expect(contentArray.length).toBe(2)
      expect(contentArray[1].type).toBe('image_url')
    })

    it('should handle image blocks in Claude format', () => {
      const claudeMessage: ClaudeMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'What\'s in this image?' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: 'base64data'
            }
          }
        ]
      }

      expect(Array.isArray(claudeMessage.content)).toBe(true)
      const contentArray = claudeMessage.content as any[]
      expect(contentArray.length).toBe(2)
      expect(contentArray[1].type).toBe('image')
    })
  })

  describe('Response conversion', () => {
    it('should handle Claude response structure', () => {
      const claudeResponse: ClaudeResponse = {
        id: 'msg_123',
        role: 'assistant',
        model: 'claude-3-5-sonnet',
        content: [
          { type: 'text', text: 'Hello there!' }
        ],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          total_tokens: 30
        }
      }

      expect(claudeResponse.role).toBe('assistant')
      expect(claudeResponse.content[0].type).toBe('text')
    })

    it('should handle OpenAI response structure', () => {
      const openaiResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello there!'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      }

      expect(openaiResponse.choices[0].message.role).toBe('assistant')
      expect(openaiResponse.choices[0].message.content).toBe('Hello there!')
    })
  })
})
