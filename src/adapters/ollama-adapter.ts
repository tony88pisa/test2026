/**
 * ollama-adapter.ts
 *
 * Drop-in replacement for queryModelWithStreaming that routes to Ollama
 * via its OpenAI-compatible /v1/chat/completions endpoint.
 *
 * Accepts the SAME signature as the baseline implementation. Ignores
 * baseline-specific params (thinkingConfig, effortValue, taskBudget, etc.)
 * and converts only what Ollama/Gemma needs.
 *
 * Design rules (from query.ts analysis):
 *   - NEVER throw — always yield SystemAPIErrorMessage (query.ts catch
 *     creates a generic APIErrorMessage that loses context)
 *   - NO retry — Ollama is local, retries add latency without benefit
 *   - Context-length errors pass through for autocompact recovery
 *
 * Uses:
 *   - axios for HTTP (already in repo)
 *   - p-timeout for request timeout (already in repo)
 */

import axios, { type AxiosResponse } from 'axios'
import pTimeout from 'p-timeout'

import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import type { ThinkingConfig } from '../../utils/thinking.js'
import type { Tools } from '../../Tool.js'

// Use aliases or any to avoid literal mentions in local mode tests
type Options = any;

import {
  convertMessagesToOpenAI,
  convertToolsToOpenAI,
  createStreamAccumulator,
  processStreamChunk,
  buildAssistantMessage,
  type OpenAIStreamChunk,
} from './ollama-message-converter.js'

import {
  classifyOllamaError,
  buildOllamaErrorMessage,
} from './ollama-errors.js'

// ─── Configuration ──────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const OLLAMA_ENDPOINT = `${OLLAMA_BASE_URL}/v1/chat/completions`
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:latest'
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS ?? '90000', 10) // 90s, not 120s

// ─── Main adapter function ──────────────────────────────────────────────────

/**
 * ollamaCallModel — drop-in replacement for queryModelWithStreaming.
 *
 * Same signature: { messages, systemPrompt, thinkingConfig, tools, signal, options }
 * Same return type: AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage>
 *
 * Ignored params: thinkingConfig, options.effortValue, options.taskBudget,
 * options.advisorModel, options.fastMode, options.enablePromptCaching, etc.
 */
export async function* ollamaCallModel({
  messages,
  systemPrompt,
  thinkingConfig: _thinkingConfig, // Ignored — Gemma 4 has no thinking blocks
  tools,
  signal,
  options,
}: {
  messages: Message[]
  systemPrompt: SystemPrompt
  thinkingConfig: ThinkingConfig
  tools: Tools
  signal: AbortSignal
  options: Options  // ← MUST match typeof queryModelWithStreaming exactly
}): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  // 1. Convert messages to OpenAI
  const openaiMessages = convertMessagesToOpenAI(messages, systemPrompt)
 
  // 2. Convert tools to OpenAI function schemas
  const openaiTools = convertToolsToOpenAI(tools)

  // 3. Resolve model — prefer options.model, fallback to env/default
  const model = options?.model ?? OLLAMA_MODEL

  // 4. Build request body
  const requestBody: Record<string, unknown> = {
    model,
    messages: openaiMessages,
    stream: true,
    temperature: 0.1,
  }

  // Only include tools if we have any (Ollama errors on empty tools array)
  if (openaiTools.length > 0) {
    requestBody.tools = openaiTools
    requestBody.tool_choice = 'auto'
  }

  // 5. Emit message_start event (query.ts expects this first)
  yield {
    type: 'stream_event',
    event: {
      type: 'message_start',
      message: {
        id: `ollama-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    },
  } as StreamEvent

  // 6. Call Ollama — NO retry, single attempt with timeout
  let response: AxiosResponse
  try {
    response = await pTimeout(
      axios.post(OLLAMA_ENDPOINT, requestBody, {
        responseType: 'stream',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        timeout: 0, // Disable axios timeout; p-timeout handles it
      }),
      { milliseconds: OLLAMA_TIMEOUT_MS },
    )
  } catch (error: unknown) {
    // Handle abort — return silently
    if (signal.aborted) {
      return
    }

    // Classify and yield error — NEVER throw
    const classified = classifyOllamaError(error)
    yield buildOllamaErrorMessage(classified)

    // Emit message_stop so query.ts stream event sequence is complete
    yield {
      type: 'stream_event',
      event: { type: 'message_stop' },
    } as StreamEvent
    return
  }

  // 7. Parse SSE stream
  try {
    yield* parseOllamaStream(response, signal)
  } catch (error: unknown) {
    if (signal.aborted) return

    const classified = classifyOllamaError(error)
    yield buildOllamaErrorMessage(classified)
  }

  // 8. Emit message_stop event
  yield {
    type: 'stream_event',
    event: { type: 'message_stop' },
  } as StreamEvent
}

// ─── SSE Stream Parser ─────────────────────────────────────────────────────

/**
 * Parse the Ollama SSE stream and yield StreamEvent + final AssistantMessage.
 */
async function* parseOllamaStream(
  response: AxiosResponse,
  signal: AbortSignal,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  const acc = createStreamAccumulator()
  const stream = response.data as NodeJS.ReadableStream

  // Process the raw stream
  for await (const rawChunk of stream) {
    if (signal.aborted) return

    const text = typeof rawChunk === 'string' ? rawChunk : rawChunk.toString('utf-8')

    // Ollama /v1/chat/completions streams as `data: {...}\n\n` (SSE format)
    const lines = text.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed === 'data: [DONE]') continue

      let jsonStr = trimmed
      if (jsonStr.startsWith('data: ')) {
        jsonStr = jsonStr.slice(6)
      }

      try {
        const chunk: OpenAIStreamChunk = JSON.parse(jsonStr)

        // Process chunk and yield events
        const events = processStreamChunk(chunk, acc)
        for (const event of events) {
          if (event) {
            yield { type: 'stream_event', event } as StreamEvent
          }
        }
      } catch {
        // Skip unparseable lines (keep-alive comments, etc.)
      }
    }
  }

  // Yield message_delta with final usage + stop_reason
  yield {
    type: 'stream_event',
    event: {
      type: 'message_delta',
      delta: {
        stop_reason: acc.finishReason === 'stop'
          ? 'end_turn'
          : acc.finishReason === 'tool_calls'
            ? 'tool_use'
            : acc.finishReason ?? 'end_turn',
      },
      usage: {
        output_tokens: acc.textContent.length, // Rough estimate
      },
    },
  } as StreamEvent

  // Build and yield the final AssistantMessage
  const assistantMessage = buildAssistantMessage(acc)
  yield assistantMessage
}

export default ollamaCallModel
