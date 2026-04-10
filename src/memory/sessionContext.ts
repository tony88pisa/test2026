/**
 * sessionContext.ts
 * Memoria persistente delle sessioni di coding.
 * Usa SuperMemory quando disponibile,
 * fallback in-memory quando CAMELOT_LOCAL=1
 * e SuperMemory non è raggiungibile.
 */

import type { OllamaMessage } from '../remote/localBridge.js'

export type CodeSession = {
  id: string
  timestamp: number
  files: string[]        // file toccati in sessione
  summary: string        // riassunto generato da gemma4
  language: string       // linguaggio principale
  decisions: string[]    // decisioni architetturali
}

export type MemoryEntry = {
  sessionId: string
  content: string        // testo indicizzabile
  metadata: {
    files?: string[]
    language?: string
    type: 'session' | 'decision' | 'snippet' | 'error'
    timestamp: number
  }
}

// In-memory fallback store
const localStore: MemoryEntry[] = []

function isSupermemoryAvailable(): boolean {
  // Se CAMELOT_LOCAL=1, preferiamo localStore a meno che non sia esplicitamente configurata una API key
  return !!(
    process.env.SUPERMEMORY_API_KEY &&
    process.env.CAMELOT_LOCAL !== '1'
  )
}

/**
 * Salva un entry di memoria.
 * SuperMemory se disponibile, altrimenti in-memory.
 */
export async function saveMemory(
  entry: MemoryEntry
): Promise<{ saved: boolean; backend: 'supermemory' | 'local' }> {
  if (isSupermemoryAvailable()) {
    try {
      const { saveMemory: persistToSuper } = await import('./supermemoryAdapter.js')
      await persistToSuper(entry.sessionId, entry.content)
      return { saved: true, backend: 'supermemory' }
    } catch {
      // fallback
    }
  }

  localStore.push(entry)
  return { saved: true, backend: 'local' }
}

/**
 * Recupera entry di memoria.
 */
export async function recallMemory(
  query: string
): Promise<MemoryEntry[]> {
  if (isSupermemoryAvailable()) {
    try {
      const { recallMemory: searchSuper } = await import('./supermemoryAdapter.js')
      const results = await searchSuper(query)
      // Mappiamo le stringhe in MemoryEntry (mocked sessionId per ora)
      return results.map(content => ({
        sessionId: 'remote',
        content,
        metadata: { type: 'session', timestamp: Date.now() }
      })) as MemoryEntry[]
    } catch {
      // fallback silenzioso
    }
  }
  // fallback locale: ricerca semplice per substring
  const q = query.toLowerCase()
  return localStore.filter(e =>
    e.content.toLowerCase().includes(q)
  )
}

/**
 * Genera un riassunto della sessione via gemma4.
 */
export async function summarizeSession(
  session: CodeSession
): Promise<string> {
  const { ollamaChatRequest } = await import('../remote/localBridge.js')
  const resp = await ollamaChatRequest([{
    role: 'user',
    content: `Summarize this coding session in 2-3 sentences:
Files touched: ${session.files.join(', ')}
Language: ${session.language}
Decisions: ${session.decisions.join('; ')}`
  }], { temperature: 0.3 })
  return resp.message.content || session.summary
}
