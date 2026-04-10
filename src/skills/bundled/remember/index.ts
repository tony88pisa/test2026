// ============================================================
// SKILL: remember v1.0.0
// REGOLA: Persistenza contesto Ember tra sessioni.
//         Scrive in src/skills/bundled/remember/memory.jsonl
//         Formato: una entry JSON per riga (append-only)
// ============================================================

import { existsSync, appendFileSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// In Bun import.meta.dir è il path assoluto della directory del file
const MEMORY_FILE = join(import.meta.dir, 'memory.jsonl')

interface MemoryEntry {
  key:       string
  value:     string
  ts:        number
  sessionId?: string
}

export function save(key: string, value: string, sessionId?: string): void {
  const entry: MemoryEntry = { key, value, ts: Date.now(), sessionId }
  appendFileSync(MEMORY_FILE, JSON.stringify(entry) + '\n', 'utf-8')
}

export function recall(query: string): MemoryEntry[] {
  if (!existsSync(MEMORY_FILE)) return []
  const lines = readFileSync(MEMORY_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
  const entries = lines.map(l => JSON.parse(l) as MemoryEntry)
  const q = query.toLowerCase()
  return entries
    .filter(e => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q))
    .slice(-20)   // ultimi 20 match
}

export function list(): MemoryEntry[] {
  if (!existsSync(MEMORY_FILE)) return []
  const lines = readFileSync(MEMORY_FILE, 'utf-8').split('\n').filter(Boolean)
  return lines.map(l => JSON.parse(l) as MemoryEntry).slice(-50)
}

export function forget(key: string): number {
  if (!existsSync(MEMORY_FILE)) return 0
  const lines  = readFileSync(MEMORY_FILE, 'utf-8').split('\n').filter(Boolean)
  const before = lines.length
  const kept   = lines.filter(l => {
    try { return (JSON.parse(l) as MemoryEntry).key !== key } catch { return true }
  })
  writeFileSync(MEMORY_FILE, kept.join('\n') + (kept.length ? '\n' : ''), 'utf-8')
  return before - kept.length
}
