/**
 * agentBindings.ts
 *
 * Vim-style keybinding registry for AI agent commands.
 * Uses a Map-based command registry (Decision #6) — not switch/case.
 * Each binding is { keys, mode, description, handler, isRepeatLast }.
 *
 * Handlers are AsyncGenerators that yield StreamEvents, compatible
 * with the agentic loop in query.ts.
 *
 * buildAgentPrompt() is a pure function, testable without calling the model.
 */

import { normalize, sep } from 'path'
import { randomUUID } from 'crypto'
import type {
  AssistantMessage,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../types/message.js'
import type { QueryDeps } from '../../query/deps.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgentBindingMode = 'NORMAL' | 'VISUAL'

export type AgentBindingContext = {
  filePath: string
  selection?: { start: number; end: number; text: string }
  cursorLine: number
  lspErrors?: Array<{ line: number; message: string; severity: string }>
  currentBuffer: string
}

export type AgentBindingHandler = (
  ctx: AgentBindingContext,
  deps: QueryDeps,
) => AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void>

export type AgentBinding = {
  keys: string
  mode: AgentBindingMode
  description: string
  handler: AgentBindingHandler
  isRepeatLast?: boolean
}

// ─── Module-level state ─────────────────────────────────────────────────────

/** Last executed binding for repeat (.) */
let lastBinding: AgentBinding | null = null
/** Last context used for repeat (.) */
let lastContext: AgentBindingContext | null = null

/**
 * Get the last executed binding (for testing).
 */
export function getLastBinding(): AgentBinding | null {
  return lastBinding
}

/**
 * Reset the last binding (for testing).
 */
export function resetLastBinding(): void {
  lastBinding = null
  lastContext = null
}

// ─── Path helper ────────────────────────────────────────────────────────────

/**
 * Normalize file paths for Windows compatibility.
 * Ensures backslash separators on Windows.
 */
export function normalizeFilePath(filePath: string): string {
  return normalize(filePath)
}

// ─── Prompt builder (pure, testable) ────────────────────────────────────────

/**
 * Build the prompt string sent to the model for a given binding + context.
 * This is a PURE function — no side effects, no model calls.
 * Exported for testing.
 */
export function buildAgentPrompt(
  ctx: AgentBindingContext,
  binding: AgentBinding,
): string {
  const normalizedPath = normalizeFilePath(ctx.filePath)
  const parts: string[] = []

  // Header with file context
  parts.push(`File: ${normalizedPath}`)
  parts.push(`Riga cursore: ${ctx.cursorLine}`)

  // Selection context (for VISUAL mode bindings)
  if (ctx.selection) {
    parts.push(`\nSelezione (righe ${ctx.selection.start}-${ctx.selection.end}):`)
    parts.push('```')
    parts.push(ctx.selection.text)
    parts.push('```')
  }

  // LSP errors context (for fix binding)
  if (ctx.lspErrors && ctx.lspErrors.length > 0) {
    parts.push('\nErrori LSP:')
    for (const err of ctx.lspErrors) {
      parts.push(`  riga ${err.line} [${err.severity}]: ${err.message}`)
    }
  }

  // Surrounding context (5 lines above and below cursor)
  const lines = ctx.currentBuffer.split('\n')
  const start = Math.max(0, ctx.cursorLine - 6)
  const end = Math.min(lines.length, ctx.cursorLine + 5)
  const surroundingLines = lines.slice(start, end)
  if (surroundingLines.length > 0 && !ctx.selection) {
    parts.push(`\nContesto (righe ${start + 1}-${end}):`)
    parts.push('```')
    parts.push(surroundingLines.join('\n'))
    parts.push('```')
  }

  // Binding-specific instruction
  switch (binding.keys) {
    case '<leader>ai':
      parts.push('\n--- Istruzione ---')
      parts.push('Analizza o trasforma il codice selezionato.')
      parts.push('Se è una funzione, suggerisci miglioramenti.')
      parts.push('Se è un blocco con errori evidenti, correggili.')
      parts.push('Rispondi con il codice modificato in un blocco ```.')
      break

    case '<leader>fix':
      parts.push('\n--- Istruzione ---')
      parts.push('Correggi l\'errore LSP indicato sopra.')
      parts.push('Mostra solo il codice corretto, non spiegazioni.')
      parts.push('Se non ci sono errori LSP, analizza la riga corrente e suggerisci fix.')
      break

    case '<leader>explain':
      parts.push('\n--- Istruzione ---')
      parts.push('Spiega il blocco di codice selezionato in italiano.')
      parts.push('Usa un linguaggio chiaro e tecnico.')
      parts.push('Includi: scopo, logica, tipi usati, e possibili edge case.')
      break

    default:
      parts.push(`\n--- Istruzione: ${binding.description} ---`)
      break
  }

  return parts.join('\n')
}

// ─── Binding handlers ───────────────────────────────────────────────────────

/**
 * Safe fallback wrapper per I/O (Ollama unreachable) - // AI_TRIGGER
 */
async function* safeYieldModelCall(
  deps: QueryDeps,
  args: any,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  try {
    // AI_TRIGGER
    yield* deps.callModel(args)
  } catch (error: any) {
    yield {
      type: 'assistant',
      uuid: deps.uuid ? deps.uuid() : randomUUID(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `⚠️ Errore AI (Fallback): Ollama non raggiungibile. Dettagli: ${error.message}` }],
        stop_reason: 'end_turn',
      },
      costUSD: 0,
    } as AssistantMessage
  }
}

/**
 * CAMELOT_LOCAL-aware handler per Vim Core
 */
async function* handleNativeVim(
  ctx: AgentBindingContext,
  deps: QueryDeps,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  if (process.env.CAMELOT_LOCAL === '1') {
    // Skip AI calls for standard core motions to ensure zero latency
    return
  }
  return
}

/**
 * <leader>ai — VISUAL mode: Send selection for AI analysis/transformation
 */
async function* handleAiTransform(
  ctx: AgentBindingContext,
  deps: QueryDeps,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  // Store for repeat
  lastBinding = AI_BINDING
  lastContext = ctx

  const prompt = buildAgentPrompt(ctx, AI_BINDING)

  yield* safeYieldModelCall(deps, {
    messages: [{
      type: 'user',
      uuid: deps.uuid(),
      message: { role: 'user', content: prompt },
    }] as any[],
    systemPrompt: 'Sei un assistente di programmazione. Rispondi in italiano quando appropriato. Produci codice pulito e ben commentato.' as any,
    thinkingConfig: { type: 'disabled' } as any,
    tools: [] as any,
    signal: new AbortController().signal,
    options: { model: process.env.OLLAMA_MODEL ?? 'gemma4:latest' } as any,
  })
}

/**
 * <leader>fix — NORMAL mode: Fix LSP error on current line
 */
async function* handleFix(
  ctx: AgentBindingContext,
  deps: QueryDeps,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  // Filter LSP errors near cursor (±2 lines tolerance)
  const nearbyErrors = (ctx.lspErrors ?? []).filter(
    err => Math.abs(err.line - ctx.cursorLine) <= 2,
  )

  const enrichedCtx: AgentBindingContext = {
    ...ctx,
    lspErrors: nearbyErrors.length > 0 ? nearbyErrors : ctx.lspErrors,
  }

  lastBinding = FIX_BINDING
  lastContext = enrichedCtx

  const prompt = buildAgentPrompt(enrichedCtx, FIX_BINDING)

  yield* safeYieldModelCall(deps, {
    messages: [{
      type: 'user',
      uuid: deps.uuid(),
      message: { role: 'user', content: prompt },
    }] as any[],
    systemPrompt: 'Sei un assistente di debugging. Correggi errori nel codice. Rispondi SOLO con il codice corretto, senza spiegazioni aggiuntive.' as any,
    thinkingConfig: { type: 'disabled' } as any,
    tools: [] as any,
    signal: new AbortController().signal,
    options: { model: process.env.OLLAMA_MODEL ?? 'gemma4:latest' } as any,
  })
}

/**
 * <leader>explain — VISUAL mode: Explain selected code in Italian
 */
async function* handleExplain(
  ctx: AgentBindingContext,
  deps: QueryDeps,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  // Enrich context with 5 lines above/below selection
  const lines = ctx.currentBuffer.split('\n')
  let enrichedCtx = ctx
  if (ctx.selection) {
    const aboveStart = Math.max(0, ctx.selection.start - 6)
    const belowEnd = Math.min(lines.length, ctx.selection.end + 5)
    const surroundAbove = lines.slice(aboveStart, ctx.selection.start - 1).join('\n')
    const surroundBelow = lines.slice(ctx.selection.end, belowEnd).join('\n')
    enrichedCtx = {
      ...ctx,
      currentBuffer: [surroundAbove, ctx.selection.text, surroundBelow].join('\n---\n'),
    }
  }

  // No repeat for explain (read-only operation)
  const prompt = buildAgentPrompt(enrichedCtx, EXPLAIN_BINDING)

  yield* safeYieldModelCall(deps, {
    messages: [{
      type: 'user',
      uuid: deps.uuid(),
      message: { role: 'user', content: prompt },
    }] as any[],
    systemPrompt: 'Sei un assistente didattico. Spiega il codice in italiano in modo chiaro e completo.' as any,
    thinkingConfig: { type: 'disabled' } as any,
    tools: [] as any,
    signal: new AbortController().signal,
    options: { model: process.env.OLLAMA_MODEL ?? 'gemma4:latest' } as any,
  })
}

/**
 * <leader>ctx — NORMAL mode: Show current context (NO model call)
 */
async function* handleShowContext(
  ctx: AgentBindingContext,
  _deps: QueryDeps,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  const normalizedPath = normalizeFilePath(ctx.filePath)
  const lines = ctx.currentBuffer.split('\n')

  const contextInfo = [
    `📁 File: ${normalizedPath}`,
    `📍 Cursore: riga ${ctx.cursorLine}`,
    `📏 Buffer: ${lines.length} righe, ${ctx.currentBuffer.length} caratteri`,
    ctx.selection
      ? `✂️  Selezione: righe ${ctx.selection.start}-${ctx.selection.end} (${ctx.selection.text.length} char)`
      : '✂️  Selezione: nessuna',
    ctx.lspErrors && ctx.lspErrors.length > 0
      ? `⚠️  Errori LSP: ${ctx.lspErrors.length}`
      : '✅ Nessun errore LSP',
    `🤖 Modello: ${process.env.OLLAMA_MODEL ?? 'gemma4:latest'}`,
    `🔌 Ollama: ${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}`,
  ].join('\n')

  // Yield a text event with the context info (no model call)
  yield {
    type: 'assistant',
    uuid: randomUUID(),
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: contextInfo }],
      stop_reason: 'end_turn',
    },
    costUSD: 0,
  } as AssistantMessage
}

/**
 * . (repeat) — NORMAL mode: Repeat last AI transformation
 */
async function* handleRepeat(
  ctx: AgentBindingContext,
  deps: QueryDeps,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  if (!lastBinding || !lastContext) {
    // Nothing to repeat — yield informational message
    yield {
      type: 'assistant',
      uuid: randomUUID(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '⚠️ Nessun comando AI precedente da ripetere.' }],
        stop_reason: 'end_turn',
      },
      costUSD: 0,
    } as AssistantMessage
    return
  }

  // Re-execute the last binding's handler with current context
  // (uses current file state, not the old context)
  yield* lastBinding.handler(ctx, deps)
}

// ─── Binding definitions ────────────────────────────────────────────────────

const AI_BINDING: AgentBinding = {
  keys: '<leader>ai',
  mode: 'VISUAL',
  description: 'Invia selezione a Gemma per analisi/trasformazione',
  handler: handleAiTransform,
}

const FIX_BINDING: AgentBinding = {
  keys: '<leader>fix',
  mode: 'NORMAL',
  description: 'Fix errore LSP sulla riga corrente',
  handler: handleFix,
}

const EXPLAIN_BINDING: AgentBinding = {
  keys: '<leader>explain',
  mode: 'VISUAL',
  description: 'Spiega il blocco selezionato in italiano',
  handler: handleExplain,
}

const CTX_BINDING: AgentBinding = {
  keys: '<leader>ctx',
  mode: 'NORMAL',
  description: 'Mostra il contesto corrente che verrebbe inviato al modello',
  handler: handleShowContext,
}

const REPEAT_BINDING: AgentBinding = {
  keys: '.',
  mode: 'NORMAL',
  description: 'Ripete l\'ultima trasformazione AI',
  handler: handleRepeat,
  isRepeatLast: true,
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Create the agent binding registry.
 * Returns a Map keyed by binding keys string.
 */
export function createAgentRegistry(): Map<string, AgentBinding> {
  const registry = new Map<string, AgentBinding>()

  const bindings = [
    AI_BINDING,
    FIX_BINDING,
    EXPLAIN_BINDING,
    CTX_BINDING,
    REPEAT_BINDING,
  ]

  // Native Vim bindings registration (CAMELOT_LOCAL-aware)
  const motions = ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', '^', 'gg', 'G']
  motions.forEach(k => bindings.push({ keys: k, mode: 'NORMAL', description: `Motion: ${k}`, handler: handleNativeVim }))

  const operators = ['d', 'c', 'y', 'p', 'dd', 'cc', 'yy', 'D', 'C', 'Y']
  operators.forEach(k => bindings.push({ keys: k, mode: 'NORMAL', description: `Operator: ${k}`, handler: handleNativeVim }))

  const modes = ['i', 'a', 'o', 'O', 'I', 'A', 'Esc', 'v', 'V', '<C-v>']
  modes.forEach(k => bindings.push({ keys: k, mode: 'NORMAL', description: `Mode: ${k}`, handler: handleNativeVim }))

  for (const binding of bindings) {
    registry.set(binding.keys, binding)
  }

  return registry
}

/**
 * Execute a binding by key.
 * Returns the AsyncGenerator if binding found, null otherwise.
 */
export function executeBinding(
  key: string,
  ctx: AgentBindingContext,
  deps: QueryDeps,
  registry: Map<string, AgentBinding>,
): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> | null {
  const binding = registry.get(key)
  if (!binding) return null
  return binding.handler(ctx, deps)
}
