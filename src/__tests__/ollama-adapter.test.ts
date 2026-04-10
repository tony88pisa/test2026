/**
 * ollama-adapter.test.ts
 *
 * Tests for ollamaCallModel with mocked axios.
 * Verifies stream events, tool_use conversion, abort behavior, and error yielding.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { Readable } from 'stream'

// ─── Mock axios before importing adapter ────────────────────────────────────

// Create a controllable mock for axios.post
let mockPostResponse: any = null
let mockPostError: any = null

const mockAxios = {
  post: mock(async (..._args: any[]) => {
    if (mockPostError) throw mockPostError
    return mockPostResponse
  }),
}

// Mock the axios module
mock.module('axios', () => ({
  default: mockAxios,
  ...mockAxios,
}))

// Mock p-timeout to pass through (no actual timeout in tests)
mock.module('p-timeout', () => ({
  default: async <T>(promise: Promise<T>, _opts: any): Promise<T> => promise,
}))

// Now import the adapter (will use mocked axios)
const { ollamaCallModel } = await import('../adapters/ollama-adapter.js')

// ─── Test helpers ───────────────────────────────────────────────────────────

function createSSEStream(chunks: string[]): Readable {
  const stream = new Readable({
    read() {
      for (const chunk of chunks) {
        this.push(chunk)
      }
      this.push(null)
    },
  })
  return stream
}

function sseChunk(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

const baseOptions = {
  model: 'gemma3:27b',
  querySource: 'sdk',
} as any

const baseParams = {
  messages: [{
    type: 'user' as const,
    uuid: 'test-1',
    message: { role: 'user', content: 'Hello' },
  }] as any[],
  systemPrompt: 'Test system prompt' as any,
  thinkingConfig: { type: 'disabled' } as any,
  tools: [] as any,
  signal: new AbortController().signal,
  options: baseOptions,
}

async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events: any[] = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ollamaCallModel', () => {
  beforeEach(() => {
    mockPostResponse = null
    mockPostError = null
    mockAxios.post.mockClear()
  })

  // ─── Test 1: Normal text stream ─────────────────────────────────────────

  it('yields text delta StreamEvents from SSE stream', async () => {
    const sseData = [
      sseChunk({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gemma3:27b',
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: 'Hello' },
          finish_reason: null,
        }],
      }),
      sseChunk({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gemma3:27b',
        choices: [{
          index: 0,
          delta: { content: ' world' },
          finish_reason: 'stop',
        }],
      }),
      'data: [DONE]\n\n',
    ]

    mockPostResponse = { data: createSSEStream(sseData) }

    const events = await collectEvents(ollamaCallModel(baseParams))

    // Should have: message_start, text_delta(Hello), text_delta( world),
    // message_delta, assistant message, message_stop
    const textDeltas = events.filter(
      (e: any) => e.type === 'stream_event' && e.event?.type === 'content_block_delta',
    )
    expect(textDeltas.length).toBeGreaterThanOrEqual(1)

    // Check text content in deltas
    const texts = textDeltas.map(
      (e: any) => e.event?.delta?.text ?? '',
    )
    expect(texts.join('')).toContain('Hello')

    // Should have final AssistantMessage
    const assistantMsgs = events.filter((e: any) => e.type === 'assistant')
    expect(assistantMsgs.length).toBe(1)
    const content = assistantMsgs[0].message.content
    expect(Array.isArray(content)).toBe(true)
    expect(content[0].type).toBe('text')
    expect(content[0].text).toContain('Hello')
  })

  // ─── Test 2: Tool use conversion ────────────────────────────────────────

  it('converts OpenAI tool_calls to Anthropic tool_use blocks', async () => {
    const sseData = [
      sseChunk({
        id: 'chatcmpl-2',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gemma3:27b',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [{
              index: 0,
              id: 'call_abc123',
              type: 'function',
              function: { name: 'bash', arguments: '' },
            }],
          },
          finish_reason: null,
        }],
      }),
      sseChunk({
        id: 'chatcmpl-2',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gemma3:27b',
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: '{"command":"ls"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      }),
      'data: [DONE]\n\n',
    ]

    mockPostResponse = { data: createSSEStream(sseData) }

    const events = await collectEvents(ollamaCallModel(baseParams))

    const assistantMsgs = events.filter((e: any) => e.type === 'assistant')
    expect(assistantMsgs.length).toBe(1)

    const content = assistantMsgs[0].message.content
    const toolUseBlock = content.find((b: any) => b.type === 'tool_use')
    expect(toolUseBlock).toBeDefined()
    expect(toolUseBlock.name).toBe('bash')
    expect(toolUseBlock.input).toEqual({ command: 'ls' })
    expect(toolUseBlock.id).toBe('call_abc123')
  })

  // ─── Test 3: Abort → no yield, no throw ─────────────────────────────────

  it('returns silently on abort without throwing', async () => {
    const controller = new AbortController()
    controller.abort() // Abort immediately

    // Mock a slow response that would normally block
    mockPostError = Object.assign(new Error('canceled'), {
      code: 'ERR_CANCELED',
    })

    const events = await collectEvents(
      ollamaCallModel({ ...baseParams, signal: controller.signal }),
    )

    // Should NOT have any error messages (abort is silent return)
    const errors = events.filter(
      (e: any) => e.type === 'system' && (e as any).subtype === 'api_error',
    )
    expect(errors.length).toBe(0)
  })

  // ─── Test 4: ECONNREFUSED → yield SystemAPIErrorMessage ────────────────

  it('yields SystemAPIErrorMessage on ECONNREFUSED', async () => {
    mockPostError = Object.assign(
      new Error('connect ECONNREFUSED 127.0.0.1:11434'),
      { code: 'ECONNREFUSED' },
    )

    const events = await collectEvents(ollamaCallModel(baseParams))

    const errors = events.filter(
      (e: any) => e.type === 'system' && (e as any).subtype === 'api_error',
    )
    expect(errors.length).toBe(1)
    expect((errors[0] as any).error).toContain('Ollama non è in esecuzione')
    expect((errors[0] as any).error).toContain('ollama serve')
  })

  // ─── Test 5: HTTP 404 → yield SystemAPIErrorMessage with "ollama pull" ─

  it('yields SystemAPIErrorMessage on 404 with ollama pull hint', async () => {
    mockPostError = Object.assign(
      new Error('Request failed with status code 404'),
      {
        response: {
          status: 404,
          data: "model 'gemma3:27b' not found",
        },
      },
    )

    const events = await collectEvents(ollamaCallModel(baseParams))

    const errors = events.filter(
      (e: any) => e.type === 'system' && (e as any).subtype === 'api_error',
    )
    expect(errors.length).toBe(1)
    expect((errors[0] as any).error).toContain('ollama pull')
  })
})
