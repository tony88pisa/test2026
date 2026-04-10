import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

const CACHE_FILE = join(import.meta.dir, '../../.search-cache.json')
const TTL = 24 * 60 * 60 * 1000  // 24 ore

interface CacheEntry {
  query:     string
  results:   unknown
  savedAt:   number
}

function load(): Record<string, CacheEntry> {
  if (!existsSync(CACHE_FILE)) return {}
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
  } catch { return {} }
}

function save(cache: Record<string, CacheEntry>): void {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

export function getCached(query: string): CacheEntry | null {
  const cache = load()
  const key = query.toLowerCase().trim()
  const entry = cache[key]
  if (!entry) return null
  if (Date.now() - entry.savedAt > TTL) {
    delete cache[key]
    save(cache)
    return null
  }
  return entry
}

export function setCache(query: string, results: unknown): void {
  const cache = load()
  const key = query.toLowerCase().trim()
  cache[key] = { query, results, savedAt: Date.now() }
  // Mantieni max 200 entry, elimina le più vecchie
  const entries = Object.entries(cache)
  if (entries.length > 200) {
    const sorted = entries.sort((a,b) => a[1].savedAt - b[1].savedAt)
    const trimmed = Object.fromEntries(sorted.slice(-200))
    save(trimmed)
  } else {
    save(cache)
  }
}

export function clearCache(): void {
  if (existsSync(CACHE_FILE)) {
    writeFileSync(CACHE_FILE, '{}')
  }
}
