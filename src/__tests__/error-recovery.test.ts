/**
 * error-recovery.test.ts
 *
 * Tests for classifyOllamaError — pure function, no mock needed.
 * Verifies all 7 error kinds are correctly classified.
 */

import { describe, it, expect } from 'bun:test'
import {
  classifyOllamaError,
  buildOllamaErrorMessage,
  type ClassifiedError,
} from '../adapters/ollama-errors.js'

describe('classifyOllamaError', () => {
  // ─── Test 1: ECONNREFUSED → connection_refused ──────────────────────────

  it('classifies ECONNREFUSED as connection_refused', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:11434')
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('connection_refused')
    expect(result.shouldAbortLoop).toBe(true)
    expect(result.message).toContain('Ollama non è in esecuzione')
    expect(result.actionable).toContain('ollama serve')
  })

  it('classifies ECONNREFUSED by error code', () => {
    const error = Object.assign(new Error('connection failed'), {
      code: 'ECONNREFUSED',
    })
    const result = classifyOllamaError(error)
    expect(result.kind).toBe('connection_refused')
    expect(result.shouldAbortLoop).toBe(true)
  })

  it('classifies ECONNREFUSED by cause.code', () => {
    const error = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    })
    const result = classifyOllamaError(error)
    expect(result.kind).toBe('connection_refused')
  })

  // ─── Test 2: HTTP 404 → model_not_found ─────────────────────────────────

  it('classifies HTTP 404 as model_not_found', () => {
    const error = {
      response: {
        status: 404,
        data: "model 'gemma3:27b' not found",
      },
    }
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('model_not_found')
    expect(result.shouldAbortLoop).toBe(true)
    expect(result.actionable).toContain('ollama pull')
    expect(result.actionable).toContain('gemma3:27b')
  })

  it('classifies 404 without model name in body', () => {
    const error = {
      response: { status: 404, data: 'not found' },
    }
    const result = classifyOllamaError(error)
    expect(result.kind).toBe('model_not_found')
    expect(result.actionable).toContain('ollama pull')
  })

  // ─── Test 3: HTTP 500 + "out of memory" → vram_oom ─────────────────────

  it('classifies HTTP 500 with "out of memory" as vram_oom', () => {
    const error = {
      response: {
        status: 500,
        data: 'Error: out of memory while loading model',
      },
    }
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('vram_oom')
    expect(result.shouldAbortLoop).toBe(true)
    expect(result.actionable).toContain('gemma3:4b')
  })

  // ─── Test 4: HTTP 500 + "CUDA out of memory" → vram_oom ────────────────

  it('classifies HTTP 500 with "CUDA out of memory" as vram_oom', () => {
    const error = {
      response: {
        status: 500,
        data: 'CUDA out of memory. Tried to allocate 2.00 GiB',
      },
    }
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('vram_oom')
    expect(result.shouldAbortLoop).toBe(true)
  })

  // ─── Test 5: TimeoutError → timeout ─────────────────────────────────────

  it('classifies TimeoutError as timeout', () => {
    const error = Object.assign(new Error('Timed out after 90000ms'), {
      name: 'TimeoutError',
    })
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('timeout')
    expect(result.shouldAbortLoop).toBe(true)
    expect(result.message).toContain('timeout')
  })

  it('classifies ETIMEDOUT as timeout', () => {
    const error = Object.assign(new Error('request timed out'), {
      code: 'ETIMEDOUT',
    })
    const result = classifyOllamaError(error)
    expect(result.kind).toBe('timeout')
  })

  // ─── Test 6: AbortError (signal.abort) → abort, NOT timeout ─────────────

  it('classifies AbortError as abort, not timeout', () => {
    const error = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    })
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('abort')
    expect(result.shouldAbortLoop).toBe(false) // query.ts handles abort
    expect(result.kind).not.toBe('timeout')
  })

  it('classifies ERR_CANCELED as abort', () => {
    const error = Object.assign(new Error('canceled'), {
      code: 'ERR_CANCELED',
    })
    const result = classifyOllamaError(error)
    expect(result.kind).toBe('abort')
  })

  // ─── Test 7: unknown error → unknown, shouldAbort=false ─────────────────

  it('classifies unknown error as unknown with shouldAbortLoop=false', () => {
    const error = new Error('Something unexpected happened')
    const result = classifyOllamaError(error)

    expect(result.kind).toBe('unknown')
    expect(result.shouldAbortLoop).toBe(false)
    expect(result.message).toContain('Something unexpected happened')
    expect(result.actionable).toContain('ollama logs')
  })

  it('classifies non-Error values', () => {
    const result = classifyOllamaError('string error')
    expect(result.kind).toBe('unknown')
    expect(result.message).toContain('string error')
  })

  it('classifies HTTP 500 without OOM as unknown', () => {
    const error = {
      response: { status: 500, data: 'Internal Server Error' },
    }
    const result = classifyOllamaError(error)
    // 500 without OOM keywords goes to unknown
    expect(result.kind).toBe('unknown')
  })
})

describe('buildOllamaErrorMessage', () => {
  it('builds a SystemAPIErrorMessage from ClassifiedError', () => {
    const classified: ClassifiedError = {
      kind: 'connection_refused',
      message: 'Ollama non è in esecuzione.',
      actionable: 'Avvia con: ollama serve',
      shouldAbortLoop: true,
    }
    const msg = buildOllamaErrorMessage(classified)

    expect(msg.type).toBe('system')
    expect((msg as any).subtype).toBe('api_error')
    expect((msg as any).level).toBe('error')
    expect((msg as any).error).toContain('Ollama non è in esecuzione')
    expect((msg as any).error).toContain('ollama serve')
    expect((msg as any).isApiErrorMessage).toBe(true)
    expect((msg as any).uuid).toBeDefined()
  })

  it('builds message without actionable when empty', () => {
    const classified: ClassifiedError = {
      kind: 'abort',
      message: 'Richiesta annullata.',
      actionable: '',
      shouldAbortLoop: false,
    }
    const msg = buildOllamaErrorMessage(classified)
    expect((msg as any).error).toBe('Richiesta annullata.')
  })
})
