/**
 * enableLocalMemory.ts
 *
 * Enables the existing SessionMemory system for local Ollama usage.
 * Does NOT reimplement memory — just activates the gate and lowers thresholds.
 *
 * SessionMemory uses runForkedAgent() → query() → deps.callModel(),
 * so if localDeps() is injected, the memory subagent automatically uses
 * ollamaCallModel. No additional adapter needed.
 *
 * Call enableLocalMemory() BEFORE the first query() call.
 */

import { setSessionMemoryConfig } from '../../services/SessionMemory/sessionMemoryUtils.js'
import { getSessionMemoryPath } from '../../utils/permissions/filesystem.js'
import { initSessionMemory } from '../../services/SessionMemory/sessionMemory.js'
import { disableAutoDream } from '../patches/disableAutoDream.js'
import { registerSideQueryOverride } from '../patches/patchSideQuery.js'
import { recallMemory } from './supermemoryAdapter.js'

/**
 * Activate SessionMemory for local Ollama sessions.
 *
 * 1. Sets env var gate (bypasses Growthbook which defaults to false)
 * 2. Lowers minimumMessageTokensToInit for shorter local sessions
 * 3. Disables autoDream background consolidation (Decision #11)
 * 4. Disables coordinator mode (Decision #12 — prevent VRAM OOM)
 * 5. Registers sideQuery override for Ollama (Decision #13)
 * 6. Registers the post-sampling hook via initSessionMemory()
 */
export function enableLocalMemory(): void {
  // 1. Enable gate without Growthbook
  process.env.CAMELOT_SESSION_MEMORY = 'true'

  // 2. Lower only minimumMessageTokensToInit for shorter local sessions.
  //    The other defaults (update=5000, toolCalls=3) are already good.
  setSessionMemoryConfig({ minimumMessageTokensToInit: 3000 })

  // 3. Disable autoDream — prevents background LLM calls competing for VRAM
  disableAutoDream()

  // 4. Enable coordinator mode — unlocked in local mode (Decision #15)
  if (process.env.CAMELOT_LOCAL === '1') {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
    console.log('[CAMELOT_LOCAL] Coordinator mode bypass active')
  }

  // 5. Register sideQuery override — routes sideQuery() calls to Ollama
  //    Only effective if upstream utils/sideQuery.ts has the 3-line patch:
  //      if (typeof globalThis.__ollamaSideQuery === 'function')
  //        return globalThis.__ollamaSideQuery(opts)
  registerSideQueryOverride()

  // 6. Initialize the post-sampling hook
  //    (requires autoCompactEnabled = true, which is the default)
  initSessionMemory()

  // 7. Recall context from Supermemory (Decision #17)
  recallMemory('last session context').then(results => {
    if (results.length > 0) {
      console.log(`[SUPERMEMORY] Recalled context: ${results[0].slice(0, 50)}...`)
    }
  }).catch(() => {/* silent fallback */})
}

// ─── Re-exports for convenience ─────────────────────────────────────────────
// Import these from enableLocalMemory instead of scattered across the codebase.

export { getSessionMemoryPath }

export {
  shouldExtractMemory,
  manuallyExtractSessionMemory,
  resetLastMemoryMessageUuid,
} from '../../services/SessionMemory/sessionMemory.js'

export {
  getSessionMemoryContent,
  waitForSessionMemoryExtraction,
  resetSessionMemoryState,
  getSessionMemoryConfig,
} from '../../services/SessionMemory/sessionMemoryUtils.js'
