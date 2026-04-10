/**
 * patchSideQuery.ts — Real Ollama implementation for sideQuery()
 *
 * BACKGROUND (from reading utils/sideQuery.ts):
 *   sideQuery() calls getAnthropicClient() → @anthropic-ai/sdk directly.
 *   It returns Promise<BetaMessage> with { content: ContentBlock[], usage, ... }
 *   It is used by findRelevantMemories, permission explainers, session search.
 *
 * PROBLEM:
 *   sideQuery() has NO override mechanism (no DI, no global hook).
 *   We cannot modify utils/sideQuery.ts without fork drift.
 *
 * SOLUTION:
 *   1. Implement ollamaSideQuery() with compatible return type
 *   2. For callers we control: use ollamaSideQuery() directly
 *   3. For callers we DON'T control: they fail silently (all catch errors)
 *
 * DECISION #13: sideQuery override requires modifying upstream file.
 *   Upstream patch needed: add 1-line check at top of sideQuery():
 *     if (globalThis.__ollamaSideQuery) return globalThis.__ollamaSideQuery(opts)
 *   Until patch is applied, findRelevantMemories returns [] (safe degradation).
 *
 * For structured output (JSON schema): Ollama doesn't support Anthropic's
 * output_config format. Instead, we inject the schema into the system prompt
 * and parse the response as JSON.
 */

import axios from 'axios'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Minimal subset of SideQueryOptions that ollamaSideQuery supports.
 * Full type is in utils/sideQuery.ts but we can't import it without
 * pulling the entire Anthropic SDK dependency chain.
 */
export interface OllamaSideQueryOptions {
  model?: string
  system?: string | Array<{ type: 'text'; text: string }>
  messages: Array<{ role: string; content: string | unknown[] }>
  max_tokens?: number
  temperature?: number
  signal?: AbortSignal
  output_format?: {
    type: string
    schema?: Record<string, unknown>
  }
  querySource: string
}

/**
 * Shape-compatible with Anthropic's BetaMessage.
 * Only the fields that callers actually use (confirmed by reading source):
 *   - findRelevantMemories: result.content.find(b => b.type === 'text').text
 *   - All callers: content array with text blocks
 */
export interface SideQueryResult {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{ type: 'text'; text: string }>
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:latest'

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Ollama-compatible replacement for sideQuery().
 *
 * Key differences from Anthropic sideQuery:
 * - Uses Ollama /v1/chat/completions (non-streaming)
 * - No OAuth, no fingerprint, no attribution headers
 * - For output_format JSON schema: injects schema into system prompt
 * - Returns shape-compatible BetaMessage-like object
 * - On error: throws (callers are expected to catch, as they do for Anthropic)
 */
export async function ollamaSideQuery(
  opts: OllamaSideQueryOptions,
): Promise<SideQueryResult> {
  const model = opts.model ?? OLLAMA_MODEL
  const maxTokens = opts.max_tokens ?? 1024
  const temperature = opts.temperature ?? 0.1

  // Build system prompt
  let systemText = ''
  if (typeof opts.system === 'string') {
    systemText = opts.system
  } else if (Array.isArray(opts.system)) {
    systemText = opts.system
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
  }

  // For JSON schema output: inject schema into system prompt
  // Ollama doesn't support Anthropic's output_config format,
  // but Gemma 3 follows JSON instructions well.
  if (opts.output_format?.schema) {
    const schemaStr = JSON.stringify(opts.output_format.schema, null, 2)
    systemText += `\n\nIMPORTANT: Respond ONLY with valid JSON matching this exact schema. Do not include any text before or after the JSON:\n${schemaStr}`
  }

  // Convert messages to OpenAI format
  const messages: Array<{ role: string; content: string }> = []

  if (systemText) {
    messages.push({ role: 'system', content: systemText })
  }

  for (const msg of opts.messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? (msg.content as Array<{ type: string; text?: string }>)
            .filter(b => b.type === 'text' && b.text)
            .map(b => b.text!)
            .join('\n')
        : String(msg.content)

    messages.push({ role: msg.role, content })
  }

  // Call Ollama (non-streaming for sideQuery)
  const response = await axios.post(
    `${OLLAMA_BASE_URL}/v1/chat/completions`,
    {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    },
    {
      signal: opts.signal,
      timeout: 30_000, // 30s — sideQuery should be fast
    },
  )

  const data = response.data
  const choice = data.choices?.[0]
  const text = choice?.message?.content ?? ''

  // Extract clean JSON if wrapped in markdown code blocks
  const cleanText = extractJSON(text)

  return {
    id: `ollama-sq-${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: cleanText }],
    model,
    stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  }
}

/**
 * Extract JSON from LLM response that may be wrapped in markdown code blocks.
 * Gemma often wraps JSON in ```json ... ```.
 */
function extractJSON(text: string): string {
  const trimmed = text.trim()

  // Try to extract from ```json ... ``` code block
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch?.[1]) {
    return jsonBlockMatch[1].trim()
  }

  // If starts with { or [, it's likely raw JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  // Return as-is and let the caller's jsonParse handle errors
  return trimmed
}

// ─── Upstream Patch Documentation ───────────────────────────────────────────

/**
 * To hook ollamaSideQuery into the upstream codebase, apply this patch
 * to utils/sideQuery.ts:
 *
 * --- a/utils/sideQuery.ts
 * +++ b/utils/sideQuery.ts
 * @@ -111,6 +111,10 @@
 *  export async function sideQuery(opts: SideQueryOptions): Promise<BetaMessage> {
 * +  // Local model override — see src/patches/patchSideQuery.ts
 * +  if (typeof globalThis.__ollamaSideQuery === 'function') {
 * +    return globalThis.__ollamaSideQuery(opts) as Promise<BetaMessage>
 * +  }
 *    const {
 *      model,
 *      system,
 *
 * Then in enableLocalMemory.ts:
 *   (globalThis as any).__ollamaSideQuery = ollamaSideQuery
 */

/**
 * Register the global override. Call from enableLocalMemory().
 * Only effective if upstream sideQuery.ts has the __ollamaSideQuery check.
 */
export function registerSideQueryOverride(): void {
  ;(globalThis as any).__ollamaSideQuery = ollamaSideQuery
}

/**
 * Callers of sideQuery() and their failure behavior:
 *
 * | Caller                 | querySource          | On Failure          | With Override   |
 * |------------------------|----------------------|---------------------|-----------------|
 * | findRelevantMemories   | memdir_relevance     | Returns []          | Returns memories|
 * | permission explainer   | permission_explainer | Fails silently      | Works           |
 * | session search         | session_search       | Returns empty       | Works           |
 * | model validation       | model_validation     | Fails (non-block)   | Works           |
 */

export const SIDE_QUERY_STATUS = {
  patched: true,
  implementation: 'ollamaSideQuery via Ollama /v1/chat/completions',
  hookMechanism: 'globalThis.__ollamaSideQuery (requires upstream 3-line patch)',
  jsonSchema: 'Injected as system prompt instruction (no Anthropic structured output)',
} as const
