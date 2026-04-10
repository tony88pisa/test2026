/**
 * localDeps.ts
 *
 * Local DI factory for the query loop.
 * Overrides ONLY callModel (→ ollamaCallModel).
 * All other deps (microcompact, autocompact, uuid) come from productionDeps().
 *
 * Also enables SessionMemory for local sessions via enableLocalMemory().
 * The hook must register BEFORE the first query() call.
 *
 * Usage:
 *   import { localDeps } from './query/localDeps.js'
 *   const result = query({ ...params, deps: localDeps() })
 */

import { randomUUID } from 'crypto'
import { autoCompactIfNeeded } from '../services/compact/autoCompact.js'
import { microcompactMessages } from '../services/compact/microCompact.js'
import { ollamaCallModel } from '../src/adapters/ollama-adapter.js'
import { enableLocalMemory } from '../src/memory/enableLocalMemory.js'
import type { QueryDeps } from './deps.js'

// Enable SessionMemory before deps are used.
// Called at module load — the hook must register before query() runs.
enableLocalMemory()

export function localDeps(): QueryDeps {
  return {
    callModel: ollamaCallModel,       // ← unico override
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID,
  }
}
