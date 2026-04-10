/**
 * ollama-message-converter.ts
 *
 * Converts between Anthropic internal message format and OpenAI chat format.
 * Isolated from the adapter for testability.
 *
 * Anthropic Message[] → OpenAI messages[]
 * Anthropic Tools → OpenAI function schemas
 * OpenAI SSE deltas → Anthropic StreamEvent / AssistantMessage
 */

import { randomUUID } from 'crypto'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import type { Tools } from '../../Tool.js'

// ─── OpenAI Types (minimal, matching Ollama /v1/chat/completions) ────────────

export type OpenAIRole = 'system' | 'user' | 'assistant' | 'tool'

export type OpenAIMessage = {
  role: OpenAIRole
  content?: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

export type OpenAIToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export type OpenAIFunctionTool = {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export type OpenAIStreamDelta = {
  role?: string
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type?: string
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

export type OpenAIStreamChoice = {
  index: number
  delta: OpenAIStreamDelta
  finish_reason: string | null
}

export type OpenAIStreamChunk = {
  id: string
  object: string
  created: number
  model: string
  choices: OpenAIStreamChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

// ─── Message Conversion: Anthropic → OpenAI ─────────────────────────────────

/**
 * Extract system prompt text from SystemPrompt type.
 * SystemPrompt is either string or array of system blocks.
 */
export function extractSystemText(systemPrompt: SystemPrompt): string {
  if (typeof systemPrompt === 'string') return systemPrompt
  if (Array.isArray(systemPrompt)) {
    return systemPrompt
      .map((block: any) => {
        if (typeof block === 'string') return block
        if (block?.text) return block.text
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return String(systemPrompt ?? '')
}

/**
 * Convert a single Anthropic internal Message to OpenAI format.
 * Returns an array (one message may expand to multiple OpenAI messages).
 */
export function convertMessageToOpenAI(msg: Message): OpenAIMessage[] {
  if (!msg || !msg.type) return []

  switch (msg.type) {
    case 'user': {
      const userMsg = msg as any
      const content = userMsg.message?.content

      // Check if this is a tool_result user message
      if (Array.isArray(content)) {
        const toolResults = content.filter(
          (block: any) => block.type === 'tool_result',
        )
        if (toolResults.length > 0) {
          // Each tool_result becomes a separate 'tool' role message
          return toolResults.map((tr: any) => ({
            role: 'tool' as const,
            tool_call_id: tr.tool_use_id ?? 'unknown',
            content: typeof tr.content === 'string'
              ? tr.content
              : JSON.stringify(tr.content ?? ''),
          }))
        }

        // Regular user message with array content — extract text
        const textParts = content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text ?? '')
        return [{
          role: 'user' as const,
          content: textParts.join('\n') || '',
        }]
      }

      return [{
        role: 'user' as const,
        content: typeof content === 'string' ? content : String(content ?? ''),
      }]
    }

    case 'assistant': {
      const assistantMsg = msg as any
      const content = assistantMsg.message?.content

      if (!content) {
        return [{ role: 'assistant' as const, content: '' }]
      }

      if (typeof content === 'string') {
        return [{ role: 'assistant' as const, content }]
      }

      if (Array.isArray(content)) {
        const textBlocks: string[] = []
        const toolCalls: OpenAIToolCall[] = []

        for (const block of content) {
          if (block.type === 'text') {
            textBlocks.push(block.text ?? '')
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id ?? randomUUID(),
              type: 'function',
              function: {
                name: block.name ?? 'unknown',
                arguments: typeof block.input === 'string'
                  ? block.input
                  : JSON.stringify(block.input ?? {}),
              },
            })
          }
          // Skip thinking, redacted_thinking, connector_text blocks
        }

        const result: OpenAIMessage = {
          role: 'assistant' as const,
          content: textBlocks.join('') || null,
        }

        if (toolCalls.length > 0) {
          result.tool_calls = toolCalls
        }

        return [result]
      }

      return [{ role: 'assistant' as const, content: '' }]
    }

    case 'system': {
      // System messages (compact boundaries, errors, etc.) are skipped
      // because OpenAI format doesn't have equivalent mid-conversation signals
      return []
    }

    default:
      // Skip attachment, progress, hook_result, tombstone, etc.
      return []
  }
}

/**
 * Convert an array of Anthropic Messages to OpenAI format.
 * Includes system prompt as first message.
 */
export function convertMessagesToOpenAI(
  messages: Message[],
  systemPrompt: SystemPrompt,
): OpenAIMessage[] {
  const result: OpenAIMessage[] = []

  // Add system prompt as first message
  const sysText = extractSystemText(systemPrompt)
  if (sysText) {
    result.push({ role: 'system', content: sysText })
  }

  // Convert each message
  for (const msg of messages) {
    result.push(...convertMessageToOpenAI(msg))
  }

  return result
}

// ─── Tool Conversion: Anthropic → OpenAI ────────────────────────────────────

/**
 * Convert Anthropic Tools array to OpenAI function tool schemas.
 * Tool is { name, description?, input_schema? } in Anthropic.
 * In OpenAI: { type: 'function', function: { name, description, parameters } }
 */
export function convertToolsToOpenAI(tools: Tools): OpenAIFunctionTool[] {
  if (!tools || tools.length === 0) return []

  return tools
    .filter((tool: any) => {
      // Skip internal/synthetic tools that Ollama can't handle
      const name = tool.name ?? ''
      if (name.startsWith('__')) return false
      return true
    })
    .map((tool: any) => ({
      type: 'function' as const,
      function: {
        name: tool.name ?? 'unknown',
        description: tool.description ?? undefined,
        parameters: tool.input_schema ?? tool.inputSchema ?? undefined,
      },
    }))
}

// ─── Stream Conversion: OpenAI → Anthropic ──────────────────────────────────

/**
 * Accumulator state for building the final AssistantMessage from stream deltas.
 */
export type StreamAccumulator = {
  textContent: string
  toolCalls: Map<number, {
    id: string
    name: string
    arguments: string
  }>
  model: string
  finishReason: string | null
}

export function createStreamAccumulator(): StreamAccumulator {
  return {
    textContent: '',
    toolCalls: new Map(),
    model: '',
    finishReason: null,
  }
}

/**
 * Process a single OpenAI stream chunk and update the accumulator.
 * Returns StreamEvent(s) to yield, or null for non-yieldable events.
 */
export function processStreamChunk(
  chunk: OpenAIStreamChunk,
  acc: StreamAccumulator,
): (StreamEvent | null)[] {
  const events: (StreamEvent | null)[] = []

  if (!chunk.choices || chunk.choices.length === 0) return events

  if (chunk.model) {
    acc.model = chunk.model
  }

  for (const choice of chunk.choices) {
    const delta = choice.delta

    // Text content delta
    if (delta.content) {
      acc.textContent += delta.content
      events.push({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: delta.content,
        },
      } as StreamEvent)
    }

    // Tool call deltas
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index
        if (!acc.toolCalls.has(idx)) {
          acc.toolCalls.set(idx, {
            id: tc.id ?? randomUUID(),
            name: tc.function?.name ?? '',
            arguments: '',
          })
        }
        const existing = acc.toolCalls.get(idx)!
        if (tc.function?.name) {
          existing.name = tc.function.name
        }
        if (tc.function?.arguments) {
          existing.arguments += tc.function.arguments
          events.push({
            type: 'content_block_delta',
            index: idx + 1, // offset by 1 if text block is at index 0
            delta: {
              type: 'input_json_delta',
              partial_json: tc.function.arguments,
            },
          } as StreamEvent)
        }
      }
    }

    // Finish reason
    if (choice.finish_reason) {
      acc.finishReason = choice.finish_reason
    }
  }

  return events
}

/**
 * Build the final AssistantMessage from accumulated stream data.
 */
export function buildAssistantMessage(
  acc: StreamAccumulator,
): AssistantMessage {
  const contentBlocks: any[] = []

  // Add text content if any
  if (acc.textContent) {
    contentBlocks.push({
      type: 'text',
      text: acc.textContent,
    })
  }

  // Add tool_use blocks from accumulated tool calls
  for (const [, tc] of acc.toolCalls) {
    let parsedInput: unknown = {}
    try {
      parsedInput = JSON.parse(tc.arguments)
    } catch {
      parsedInput = { raw: tc.arguments }
    }

    contentBlocks.push({
      type: 'tool_use',
      id: tc.id,
      name: tc.name,
      input: parsedInput,
    })
  }

  // Determine stop_reason from finish_reason
  let stopReason: string | null = null
  if (acc.finishReason === 'stop') {
    stopReason = 'end_turn'
  } else if (acc.finishReason === 'tool_calls') {
    stopReason = 'tool_use'
  } else if (acc.finishReason === 'length') {
    stopReason = 'max_tokens'
  }

  return {
    type: 'assistant',
    uuid: randomUUID(),
    message: {
      role: 'assistant',
      content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: '' }],
      stop_reason: stopReason,
      usage: null,
    },
    costUSD: 0, // Local model, no cost
  } as AssistantMessage
}

/**
 * Build a SystemAPIErrorMessage from an error.
 */
export function buildErrorMessage(error: unknown): SystemAPIErrorMessage {
  const message = error instanceof Error ? error.message : String(error)
  return {
    type: 'system',
    subtype: 'api_error',
    uuid: randomUUID(),
    level: 'error',
    message: `Ollama error: ${message}`,
    error: message,
  } as SystemAPIErrorMessage
}
