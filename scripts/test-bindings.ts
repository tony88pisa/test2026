/**
 * test-bindings.ts — Smoke test per il registry delle agent bindings.
 *
 * Esegui: bun run scripts/test-bindings.ts
 *
 * NON richiede Ollama — testa solo registry, prompt builder, e executeBinding.
 */

import {
  createAgentRegistry,
  buildAgentPrompt,
  executeBinding,
  normalizeFilePath,
  resetLastBinding,
  getLastBinding,
  type AgentBindingContext,
} from '../src/vim/agentBindings.js'

console.log('=== Agent Bindings Test ===\n')

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

// ─── Test context ───────────────────────────────────────────────────────────

const testCtx: AgentBindingContext = {
  filePath: 'h:\\ai code\\src\\adapters\\ollama-adapter.ts',
  selection: {
    start: 10,
    end: 15,
    text: 'const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"',
  },
  cursorLine: 12,
  lspErrors: [
    { line: 12, message: "Cannot find name 'process'.", severity: 'error' },
    { line: 50, message: 'Unused variable.', severity: 'warning' },
  ],
  currentBuffer: Array.from({ length: 30 }, (_, i) =>
    `// riga ${i + 1}: contenuto di esempio`
  ).join('\n'),
}

// Mock deps (just enough for type checking)
const mockDeps = {
  callModel: async function* () { /* noop */ },
  microcompact: async () => ({ messages: [], didCompact: false }),
  autocompact: async () => ({ messages: [], didCompact: false }),
  uuid: () => 'test-uuid-1234',
} as any

// ─── Test 1: Registry creation ──────────────────────────────────────────────

console.log('Test 1: Registry creation')
const registry = createAgentRegistry()
assert(registry instanceof Map, 'registry is a Map')
assert(registry.size === 5, `registry has 5 entries (got ${registry.size})`)
assert(registry.has('<leader>ai'), 'has <leader>ai')
assert(registry.has('<leader>fix'), 'has <leader>fix')
assert(registry.has('<leader>explain'), 'has <leader>explain')
assert(registry.has('<leader>ctx'), 'has <leader>ctx')
assert(registry.has('.'), 'has . (repeat)')

// ─── Test 2: Binding properties ─────────────────────────────────────────────

console.log('\nTest 2: Binding properties')
const aiBinding = registry.get('<leader>ai')!
assert(aiBinding.mode === 'VISUAL', '<leader>ai mode = VISUAL')
assert(typeof aiBinding.handler === 'function', '<leader>ai handler is function')
assert(typeof aiBinding.description === 'string', '<leader>ai has description')

const fixBinding = registry.get('<leader>fix')!
assert(fixBinding.mode === 'NORMAL', '<leader>fix mode = NORMAL')

const repeatBinding = registry.get('.')!
assert(repeatBinding.isRepeatLast === true, '. has isRepeatLast = true')

// ─── Test 3: buildAgentPrompt includes selection ────────────────────────────

console.log('\nTest 3: buildAgentPrompt')
const prompt = buildAgentPrompt(testCtx, aiBinding)
assert(prompt.includes('ollama-adapter.ts'), 'prompt includes file path')
assert(prompt.includes('OLLAMA_BASE_URL'), 'prompt includes selection text')
assert(prompt.includes('Riga cursore: 12'), 'prompt includes cursor line')
assert(prompt.includes('Analizza o trasforma'), 'prompt includes AI instruction')
assert(prompt.includes('Selezione'), 'prompt includes selection header')

const fixPrompt = buildAgentPrompt(testCtx, fixBinding)
assert(fixPrompt.includes("Cannot find name 'process'"), 'fix prompt includes LSP error')
assert(fixPrompt.includes('Correggi'), 'fix prompt includes fix instruction')

const explainBinding = registry.get('<leader>explain')!
const explainPrompt = buildAgentPrompt(testCtx, explainBinding)
assert(explainPrompt.includes('Spiega'), 'explain prompt includes explain instruction')
assert(explainPrompt.includes('italiano'), 'explain prompt mentions Italian')

// ─── Test 4: executeBinding with unknown key ────────────────────────────────

console.log('\nTest 4: executeBinding with unknown key')
const result = executeBinding('unknown_key', testCtx, mockDeps, registry)
assert(result === null, 'unknown key returns null')

const validResult = executeBinding('<leader>ctx', testCtx, mockDeps, registry)
assert(validResult !== null, '<leader>ctx returns generator')

// ─── Test 5: Repeat with null lastBinding ───────────────────────────────────

console.log('\nTest 5: Repeat (.) with no previous command')
resetLastBinding()
assert(getLastBinding() === null, 'lastBinding is null after reset')

const repeatResult = executeBinding('.', testCtx, mockDeps, registry)
assert(repeatResult !== null, 'repeat returns generator (not null)')
// Consume the generator to verify it doesn't crash
try {
  const gen = repeatResult!
  const first = await gen.next()
  assert(!first.done || first.value !== undefined, 'repeat yields message without crash')
  // Check if it's the "no previous command" message
  if (first.value && (first.value as any).type === 'assistant') {
    const text = (first.value as any).message?.content?.[0]?.text ?? ''
    assert(text.includes('Nessun comando'), 'repeat yields warning message')
  }
} catch (err) {
  console.log(`  ❌ repeat crashed: ${err}`)
  failed++
}

// ─── Test 6: normalizeFilePath ──────────────────────────────────────────────

console.log('\nTest 6: normalizeFilePath')
const normalized = normalizeFilePath('h:\\ai code\\src\\..\\src\\vim\\agentBindings.ts')
assert(!normalized.includes('..'), 'normalized path has no ..')
assert(typeof normalized === 'string', 'normalizeFilePath returns string')

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n─── Risultato ───`)
console.log(`  Passati: ${passed}`)
console.log(`  Falliti: ${failed}`)

if (failed === 0) {
  console.log(`\n🎉 Tutti i test passati!\n`)
} else {
  console.log(`\n⚠️  ${failed} test falliti — controlla i log sopra\n`)
  process.exit(1)
}
