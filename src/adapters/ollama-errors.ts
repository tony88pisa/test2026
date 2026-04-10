/**
 * ollama-errors.ts
 *
 * Specialized error classification and message building for local Ollama.
 *
 * Design rules (from query.ts analysis):
 *   - NEVER throw from ollamaCallModel — query.ts catch creates a generic
 *     APIErrorMessage that loses context. Always YIELD a SystemAPIErrorMessage.
 *   - Exception: AbortError when signal.aborted — that's expected by the loop.
 *   - NO retry — Ollama is local, retries just add latency on localhost.
 *   - Context-length errors are NOT handled here — let autocompact/reactiveCompact
 *     in query.ts handle them (they have the recovery machinery).
 */

import { randomUUID } from 'crypto'
import type { SystemAPIErrorMessage } from '../../types/message.js'

// ─── Error Classification ───────────────────────────────────────────────────

export type OllamaErrorKind =
  | 'connection_refused'  // Ollama not running
  | 'model_not_found'     // 404 — model not pulled
  | 'vram_oom'            // 500 + "out of memory" / "CUDA"
  | 'context_too_long'    // 413 or "context length" in body — pass-through
  | 'timeout'             // Response took too long
  | 'abort'               // User/signal abort
  | 'unknown'             // Anything else

export type ClassifiedError = {
  kind: OllamaErrorKind
  message: string
  actionable: string        // Human-readable fix instruction
  shouldAbortLoop: boolean  // If true, the caller should stop the agent loop
  rawError?: unknown
}

/**
 * Classify an error from an Ollama HTTP call.
 * Inspects axios error shape, HTTP status, and response body.
 */
export function classifyOllamaError(error: unknown): ClassifiedError {
  // -- Abort (user-initiated or signal-triggered) --
  if (isAbortError(error)) {
    return {
      kind: 'abort',
      message: 'Richiesta annullata.',
      actionable: '',
      shouldAbortLoop: false, // query.ts handles abort naturally
      rawError: error,
    }
  }

  const axiosErr = error as any

  // -- Connection refused (Ollama not running) --
  if (isConnectionRefused(axiosErr)) {
    return {
      kind: 'connection_refused',
      message: 'Ollama non è in esecuzione su localhost:11434.',
      actionable: 'Avvia con: ollama serve',
      shouldAbortLoop: true,
      rawError: error,
    }
  }

  // -- Timeout --
  if (isTimeout(axiosErr)) {
    return {
      kind: 'timeout',
      message: 'Ollama non risponde (timeout 90s).',
      actionable: 'Verifica: ollama serve && ollama list',
      shouldAbortLoop: true,
      rawError: error,
    }
  }

  // -- HTTP status-based classification --
  const status = axiosErr?.response?.status
  const body = extractResponseBody(axiosErr)

  // 404 — model not found
  if (status === 404) {
    const model = extractModelFromBody(body)
    return {
      kind: 'model_not_found',
      message: `Modello non trovato${model ? `: ${model}` : ''}.`,
      actionable: `Esegui: ollama pull ${model ?? 'gemma4:latest'}`,
      shouldAbortLoop: true,
      rawError: error,
    }
  }

  // 413 or context-length error — pass-through to query.ts recovery
  if (status === 413 || isContextLengthError(body)) {
    return {
      kind: 'context_too_long',
      message: `Contesto troppo lungo: ${body ?? 'token limit exceeded'}`,
      actionable: '', // query.ts autocompact handles this
      shouldAbortLoop: false, // Let query.ts try recovery
      rawError: error,
    }
  }

  // 500 with OOM/CUDA — VRAM exhaustion
  if (status === 500 && isVramOomError(body)) {
    return {
      kind: 'vram_oom',
      message: 'VRAM insufficiente per il modello corrente.',
      actionable: 'Prova: ollama run gemma3:4b (o riduci num_ctx)',
      shouldAbortLoop: true,
      rawError: error,
    }
  }

  // -- Fallback --
  const msg = error instanceof Error ? error.message : String(error)
  return {
    kind: 'unknown',
    message: `Errore Ollama: ${msg}`,
    actionable: 'Controlla i log di Ollama: ollama logs',
    shouldAbortLoop: false,
    rawError: error,
  }
}

// ─── SystemAPIErrorMessage builders ─────────────────────────────────────────

/**
 * Build a SystemAPIErrorMessage from a ClassifiedError.
 * The shape matches what query.ts expects when yielded from callModel.
 */
export function buildOllamaErrorMessage(
  classified: ClassifiedError,
): SystemAPIErrorMessage {
  const fullMessage = classified.actionable
    ? `${classified.message} ${classified.actionable}`
    : classified.message

  return {
    type: 'system',
    subtype: 'api_error',
    uuid: randomUUID(),
    level: 'error',
    message: fullMessage,
    error: fullMessage,
    // Mark as API error so query.ts error handling recognizes it
    isApiErrorMessage: true,
  } as SystemAPIErrorMessage
}

/**
 * Convenience: classify + build in one call.
 */
export function ollamaErrorToMessage(error: unknown): SystemAPIErrorMessage {
  const classified = classifyOllamaError(error)
  return buildOllamaErrorMessage(classified)
}

/**
 * Returns true if the classified error should abort the current agent loop.
 */
export function shouldAbort(error: unknown): boolean {
  return classifyOllamaError(error).shouldAbortLoop
}

// ─── Detection helpers ──────────────────────────────────────────────────────

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && error.name === 'AbortError') return true
  // axios wraps abort as CanceledError
  const code = (error as any)?.code
  if (code === 'ERR_CANCELED' || code === 'ABORT_ERR') return true
  return false
}

function isConnectionRefused(error: any): boolean {
  const code = error?.code ?? error?.cause?.code
  if (code === 'ECONNREFUSED') return true
  if (code === 'ENOTFOUND') return true
  // axios network errors
  if (error?.message?.includes?.('ECONNREFUSED')) return true
  if (error?.message?.includes?.('connect ECONNREFUSED')) return true
  return false
}

function isTimeout(error: any): boolean {
  const code = error?.code
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED') return true
  // p-timeout wraps as TimeoutError
  if (error?.name === 'TimeoutError') return true
  if (error?.message?.includes?.('timed out')) return true
  if (error?.message?.includes?.('Timed out')) return true
  return false
}

function isVramOomError(body: string | null): boolean {
  if (!body) return false
  const lower = body.toLowerCase()
  return (
    lower.includes('out of memory') ||
    lower.includes('cuda error') ||
    lower.includes('cuda out of memory') ||
    lower.includes('oom') ||
    lower.includes('gpu memory') ||
    lower.includes('vram')
  )
}

function isContextLengthError(body: string | null): boolean {
  if (!body) return false
  const lower = body.toLowerCase()
  return (
    lower.includes('context length') ||
    lower.includes('context_length_exceeded') ||
    lower.includes('maximum context') ||
    lower.includes('token limit') ||
    lower.includes('too many tokens')
  )
}

function extractResponseBody(error: any): string | null {
  // axios puts response data in error.response.data
  const data = error?.response?.data
  if (!data) return null
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function extractModelFromBody(body: string | null): string | null {
  if (!body) return null
  // Try to extract model name from error messages like "model 'xxx' not found"
  const match = body.match(/model\s+['"]([^'"]+)['"]/i)
  return match?.[1] ?? null
}
