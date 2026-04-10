// ============================================================
// MODULO: CostTracker v1.1
// REGOLA: Traccia ogni chiamata AI e propaga aggiornamenti via SSE.
//         VIETATO aggiornare i contatori token fuori da questo modulo.
//         I costi locali (Ollama/Gemma) sono sempre 0.
// DIPENDENZE: SSEManager (M2)
// DEPRECA: versione v1.0 (addUsage)
// SYNC: aggiornare SYNC.md dopo merge
// ============================================================

import { SSEManager, SSEEventType } from './SSEManager'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  model: string
  sessionId: string
  queryId?: string
}

export interface CostSummary {
  totalInputTokens: number
  totalOutputTokens: number
  totalCalls: number
  estimatedUSD: number
  sessions: Record<string, SessionStats>
  sinceTimestamp: number
  lastUpdated: number
}

export interface SessionStats {
  inputTokens: number
  outputTokens: number
  calls: number
  model: string
  estimatedUSD: number
}

// Costi per milione di token (USD) — aggiornare quando cambiano i prezzi
// Modelli locali = 0 per definizione
const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  // Locali (Ollama)
  'gemma4:latest':          { input: 0, output: 0 },
  'gemma3:latest':          { input: 0, output: 0 },
  'llama3.3:latest':        { input: 0, output: 0 },
  'qwen2.5-coder:latest':   { input: 0, output: 0 },
  // OpenAI
  'gpt-4o':                 { input: 2.5, output: 10 },
  'gpt-4o-mini':            { input: 0.15, output: 0.6 },
  // Anthropic
  'claude-sonnet-4-5':      { input: 3, output: 15 },
  'claude-haiku-3-5':       { input: 0.8, output: 4 },
  // Google
  'gemini-2.0-flash':       { input: 0.1, output: 0.4 },
  // Default fallback (OpenRouter etc.)
  'default':                { input: 1, output: 3 },
}

export class CostTracker {
  private static instance: CostTracker
  private summary: CostSummary
  private sse: SSEManager

  private constructor() {
    this.sse = SSEManager.getInstance()
    this.summary = this.createFreshSummary()
  }

  static getInstance(): CostTracker {
    if (!CostTracker.instance) CostTracker.instance = new CostTracker()
    return CostTracker.instance
  }

  /** Registra una chiamata AI e aggiorna i contatori */
  track(usage: TokenUsage): void {
    const rates = COST_PER_MILLION[usage.model] ?? COST_PER_MILLION['default']
    const costUSD =
      (usage.inputTokens / 1_000_000) * rates.input +
      (usage.outputTokens / 1_000_000) * rates.output

    this.summary.totalInputTokens += usage.inputTokens
    this.summary.totalOutputTokens += usage.outputTokens
    this.summary.totalCalls++
    this.summary.estimatedUSD += costUSD
    this.summary.lastUpdated = Date.now()

    // Aggiorna statistiche sessione
    if (!this.summary.sessions[usage.sessionId]) {
      this.summary.sessions[usage.sessionId] = {
        inputTokens: 0, outputTokens: 0,
        calls: 0, model: usage.model, estimatedUSD: 0
      }
    }
    const session = this.summary.sessions[usage.sessionId]
    session.inputTokens += usage.inputTokens
    session.outputTokens += usage.outputTokens
    session.calls++
    session.estimatedUSD += costUSD

    // Propaga via SSE per aggiornamento dashboard in real-time
    this.sse.emit(SSEEventType.COST_UPDATE, {
      ...this.getSummary(),
      lastQuery: usage
    })
  }

  /** Restituisce una copia immutabile del sommario corrente */
  getSummary(): CostSummary {
    return JSON.parse(JSON.stringify(this.summary)) as CostSummary
  }

  /** Resetta i contatori (mantiene la struttura) */
  reset(): void {
    this.summary = this.createFreshSummary()
    this.sse.emit(SSEEventType.COST_UPDATE, this.getSummary())
  }

  /** Aggiunge un modello custom con costi specifici */
  addModelPricing(modelId: string, inputPerM: number, outputPerM: number): void {
    COST_PER_MILLION[modelId] = { input: inputPerM, output: outputPerM }
  }

  private createFreshSummary(): CostSummary {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      estimatedUSD: 0,
      sessions: {},
      sinceTimestamp: Date.now(),
      lastUpdated: Date.now()
    }
  }
}
