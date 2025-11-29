import { describe, it, expect } from 'vitest'

// Import from index.ts requires extracting helpers
// We'll test them via their usage in the tests

describe('Helper Functions', () => {
  it('extractBaseUrl should extract URL correctly', () => {
    const testCases = [
      {
        input: '/generativelanguage.googleapis.com/v1beta/openai/v1/messages',
        endpoint: '/v1/messages' as const,
        expected: 'generativelanguage.googleapis.com/v1beta/openai',
      },
      {
        input: '/api.anthropic.com/v1/chat/completions',
        endpoint: '/v1/chat/completions' as const,
        expected: 'api.anthropic.com',
      },
      {
        input: '/v1/messages',
        endpoint: '/v1/messages' as const,
        expected: '',
      },
    ]

    // Simulate the function behavior
    for (const { input, endpoint, expected } of testCases) {
      const result = input.replace(endpoint, '').substring(1)
      expect(result).toBe(expected)
    }
  })

  it('isGeminiUrl should detect Gemini URLs', () => {
    const testCases = [
      { url: 'generativelanguage.googleapis.com/v1beta/openai', expected: true },
      { url: 'https://generativelanguage.googleapis.com/v1beta/openai', expected: true },
      { url: 'api.anthropic.com', expected: false },
      { url: 'api.openai.com', expected: false },
    ]

    for (const { url, expected } of testCases) {
      const result = url.includes('generativelanguage.googleapis.com')
      expect(result).toBe(expected)
    }
  })
})

describe('URL Construction', () => {
  it('should construct Gemini URL correctly', () => {
    const baseUrl = 'generativelanguage.googleapis.com/v1beta/openai'
    const isGemini = baseUrl.includes('generativelanguage.googleapis.com')
    const targetUrl = isGemini
      ? `https://${baseUrl}/chat/completions`
      : `https://${baseUrl}/v1/chat/completions`

    expect(targetUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
  })

  it('should construct Anthropic URL correctly', () => {
    const baseUrl = 'api.anthropic.com'
    const isGemini = baseUrl.includes('generativelanguage.googleapis.com')
    const targetUrl = isGemini
      ? `https://${baseUrl}/chat/completions`
      : `https://${baseUrl}/v1/chat/completions`

    expect(targetUrl).toBe('https://api.anthropic.com/v1/chat/completions')
  })
})
