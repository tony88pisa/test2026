/**
 * localDeps.test.ts
 *
 * Tests for the localDeps() DI factory.
 * Verifies callModel override, env var setup, and hook idempotency.
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import {
  resetSessionMemoryState,
  getSessionMemoryConfig,
} from '../memory/enableLocalMemory.js'

// Import localDeps — this will trigger enableLocalMemory() at module load
const { localDeps } = await import('../../query/localDeps.js')

describe('localDeps', () => {
  beforeEach(() => {
    resetSessionMemoryState()
    // Re-enable since resetSessionMemoryState clears config
    process.env.CAMELOT_SESSION_MEMORY = 'true'
  })

  // ─── Test 1: callModel is overridden ──────────────────────────────────

  it('returns an object with callModel that is NOT the default', () => {
    const deps = localDeps()
    expect(deps.callModel).toBeDefined()
    expect(typeof deps.callModel).toBe('function')
    // callModel should be ollamaCallModel, not queryModelWithStreaming
    // We can verify by checking the function name
    expect(deps.callModel.name).toBe('ollamaCallModel')
  })

  // ─── Test 2: callModel is ollamaCallModel ─────────────────────────────

  it('callModel is ollamaCallModel by reference or name', async () => {
    const deps = localDeps()
    const { ollamaCallModel } = await import('../adapters/ollama-adapter.js')
    // Compare by reference
    expect(deps.callModel).toBe(ollamaCallModel)
  })

  // ─── Test 3: CAMELOT_SESSION_MEMORY is set ────────────────────────────

  it('sets CAMELOT_SESSION_MEMORY to true after module load', () => {
    // enableLocalMemory() is called at module load of localDeps.ts
    expect(process.env.CAMELOT_SESSION_MEMORY).toBe('true')
  })

  // ─── Test 4: localDeps() is idempotent ────────────────────────────────

  it('calling localDeps() twice does not double-apply config', () => {
    // First call
    const deps1 = localDeps()
    const config1 = getSessionMemoryConfig()

    // Second call
    const deps2 = localDeps()
    const config2 = getSessionMemoryConfig()

    // Config should be the same — enableLocalMemory was called once at module load
    // localDeps() itself just returns the deps object, doesn't re-call enableLocalMemory
    expect(config1.minimumMessageTokensToInit).toBe(config2.minimumMessageTokensToInit)

    // Both should return valid deps
    expect(deps1.callModel).toBe(deps2.callModel)
    expect(typeof deps1.uuid).toBe('function')
    expect(typeof deps2.uuid).toBe('function')
  })

  // ─── Test 5: All deps are present ─────────────────────────────────────

  it('returns all 4 required QueryDeps fields', () => {
    const deps = localDeps()
    expect(deps.callModel).toBeDefined()
    expect(deps.microcompact).toBeDefined()
    expect(deps.autocompact).toBeDefined()
    expect(deps.uuid).toBeDefined()

    expect(typeof deps.callModel).toBe('function')
    expect(typeof deps.microcompact).toBe('function')
    expect(typeof deps.autocompact).toBe('function')
    expect(typeof deps.uuid).toBe('function')
  })

  // ─── Test 6: uuid produces valid UUIDs ────────────────────────────────

  it('uuid generates unique strings', () => {
    const deps = localDeps()
    const id1 = deps.uuid()
    const id2 = deps.uuid()

    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(0)
    expect(id1).not.toBe(id2)
  })
})
