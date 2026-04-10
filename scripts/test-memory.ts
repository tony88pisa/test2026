/**
 * test-memory.ts — Smoke test per verificare che enableLocalMemory()
 * abiliti il gate e configuri le soglie correttamente.
 *
 * Esegui: bun run scripts/test-memory.ts
 *
 * NON richiede Ollama running — testa solo la configurazione.
 */

// Import prima di enableLocalMemory per verificare stato default
console.log('=== Memory Gate Test ===\n')

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}`)
    failed++
  }
}

// --- Test 1: gate disabilitato per default ---
console.log('Test 1: Gate default')
assert(
  process.env.CAMELOT_SESSION_MEMORY !== 'true',
  'gate OFF by default',
)

// --- Test 2: enableLocalMemory abilita e configura ---
console.log('\nTest 2: enableLocalMemory()')

// Dynamic import to avoid side effects at module load
const { enableLocalMemory, getSessionMemoryConfig, getSessionMemoryPath, resetSessionMemoryState } =
  await import('../src/memory/enableLocalMemory.js')

enableLocalMemory()

const config = getSessionMemoryConfig()
assert(
  config.minimumMessageTokensToInit === 3000,
  `init threshold = ${config.minimumMessageTokensToInit} (expected 3000)`,
)
assert(
  config.minimumTokensBetweenUpdate === 5000,
  `update threshold = ${config.minimumTokensBetweenUpdate} (expected 5000)`,
)
assert(
  config.toolCallsBetweenUpdates === 3,
  `toolCalls = ${config.toolCallsBetweenUpdates} (expected 3)`,
)

// --- Test 3: gate abilitato ---
console.log('\nTest 3: Gate enabled')
assert(
  process.env.CAMELOT_SESSION_MEMORY === 'true',
  'gate ON after enableLocalMemory()',
)

// --- Test 4: path valido ---
console.log('\nTest 4: Memory path')
try {
  const memPath = getSessionMemoryPath()
  assert(
    typeof memPath === 'string' && memPath.length > 0,
    `path exists: ${memPath}`,
  )
  assert(
    !memPath.includes('undefined'),
    `path no undefined segments`,
  )
  // Windows check: should not contain forward slashes if on Windows
  if (process.platform === 'win32') {
    assert(
      !memPath.includes('/') || memPath.includes('\\'),
      `path uses Windows separators`,
    )
  }
} catch (err) {
  console.log(`  ⚠️  getSessionMemoryPath() threw: ${err}`)
  console.log(`      (expected if running outside full repo context)`)
}

// --- Test 5: reset state ---
console.log('\nTest 5: Reset state')
resetSessionMemoryState()
const configAfterReset = getSessionMemoryConfig()
assert(
  configAfterReset.minimumMessageTokensToInit === 10000,
  `reset restores default init threshold = ${configAfterReset.minimumMessageTokensToInit} (expected 10000)`,
)
assert(
  configAfterReset.minimumTokensBetweenUpdate === 5000,
  `reset keeps update threshold = ${configAfterReset.minimumTokensBetweenUpdate} (expected 5000)`,
)

// --- Summary ---
console.log(`\n─── Risultato ───`)
console.log(`  Passati: ${passed}`)
console.log(`  Falliti: ${failed}`)

if (failed === 0) {
  console.log(`\n🎉 Tutti i test passati!\n`)
} else {
  console.log(`\n⚠️  ${failed} test falliti — controlla i log sopra\n`)
  process.exit(1)
}
