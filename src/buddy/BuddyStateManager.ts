// ============================================================
// MODULO: BuddyStateManager v1.0 — Modulo M20
// REGOLA: Centralizza lo stato operativo ed emotivo di Ember.
//         Polling automatico per Ollama e notifiche via SSE.
// ============================================================

import { SSEManager, SSEEventType } from '../server/SSEManager'

export type EmberMood = 'idle' | 'thinking' | 'working' | 'error' | 'success'

export interface BuddyState {
  mood: EmberMood
  currentTask: string | null
  lastActivity: number        // timestamp
  messageCount: number        // totale messaggi sessione
  sessionStart: number        // timestamp avvio
  ollamaOnline: boolean
  remoteUrl: string | null
}

export class BuddyStateManager {
  private static instance: BuddyStateManager
  private state: BuddyState = {
    mood:         'idle',
    currentTask:  null,
    lastActivity: Date.now(),
    messageCount: 0,
    sessionStart: Date.now(),
    ollamaOnline: false,
    remoteUrl:    null,
  }

  static getInstance(): BuddyStateManager {
    if (!BuddyStateManager.instance) BuddyStateManager.instance = new BuddyStateManager()
    return BuddyStateManager.instance
  }

  private constructor() {
    // Avvio del monitoraggio automatico di Ollama
    this.startOllamaPolling()
  }

  /** Restituisce lo stato corrente */
  getState(): BuddyState {
    return this.state
  }

  /** Aggiorna lo stato e notifica i client via SSE */
  setState(partial: Partial<BuddyState>) {
    this.state = { 
      ...this.state, 
      ...partial, 
      lastActivity: Date.now() 
    }
    
    // Notifica push a tutti i client dashboard
    SSEManager.getInstance().emit(SSEEventType.BUDDY_STATE, { 
      state: this.state,
      ts:    Date.now()
    })
  }

  /** Scorciatoia per aggiornare il conteggio messaggi */
  incrementMessageCount() {
    this.setState({ messageCount: this.state.messageCount + 1 })
  }

  private startOllamaPolling() {
    this.checkOllama()
    // Controllo ogni 30 secondi come da specifica M20
    setInterval(() => this.checkOllama(), 30000)
  }

  private async checkOllama() {
    const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
    try {
      // Health check ultra-rapido
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { 
        signal: AbortSignal.timeout(2000) 
      })
      const isOnline = res.ok
      if (isOnline !== this.state.ollamaOnline) {
        this.setState({ ollamaOnline: isOnline })
      }
    } catch {
      if (this.state.ollamaOnline) {
        this.setState({ ollamaOnline: false })
      }
    }
  }
}
