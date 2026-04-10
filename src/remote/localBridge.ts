/**
 * localBridge.ts
 * CAMELOT_LOCAL=1 → sostituisce SessionsWebSocket
 * con un bridge diretto verso Ollama HTTP API.
 * Zero dipendenze da Anthropic/WSS esterni.
 */

export const OLLAMA_BASE_URL =
  process.env.CAMELOT_OLLAMA_URL ?? 'http://localhost:11434'

export const OLLAMA_MODEL =
  process.env.CAMELOT_MODEL ?? 'gemma4:latest'

export type OllamaMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OllamaTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description?: string
      }>
      required?: string[]
    }
  }
}

export type OllamaToolCall = {
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export type OllamaRequest = {
  model: string
  messages: OllamaMessage[]
  stream: boolean
  tools?: OllamaTool[]
  options?: {
    temperature?: number
    num_predict?: number
    thinking?: boolean // Gemma4 thinking mode
  }
}

export type OllamaResponse = {
  model: string
  message: OllamaMessage
  done: boolean
  tool_calls?: OllamaToolCall[]
  thinking?: string // reasoning chain se thinking:true
  error?: string
}

/**
 * Invia una richiesta a Ollama /api/chat.
 * Restituisce la risposta o un fallback strutturato.
 * NON lancia mai eccezioni — gestisce tutto internamente.
 */
export async function ollamaChatRequest(
  messages: OllamaMessage[],
  options?: OllamaRequest['options'],
  tools?: OllamaTool[]
): Promise<OllamaResponse> {
  const body: OllamaRequest = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    options,
    tools,
  }
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      return {
        model: OLLAMA_MODEL,
        message: { role: 'assistant', content: '' },
        done: true,
        error: `HTTP ${res.status}`,
      }
    }
    return (await res.json()) as OllamaResponse
  } catch (e) {
    return {
      model: OLLAMA_MODEL,
      message: {
        role: 'assistant',
        content: '⚠️ Ollama non raggiungibile.',
      },
      done: true,
      error: String(e),
    }
  }
}

/**
 * isLocalMode() — true quando CAMELOT_LOCAL=1
 * Usato dai moduli remote per decidere se usare
 * localBridge o SessionsWebSocket originale.
 */
export function isLocalMode(): boolean {
  return process.env.CAMELOT_LOCAL === '1'
}
