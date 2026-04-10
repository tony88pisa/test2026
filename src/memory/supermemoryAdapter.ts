/**
 * src/memory/supermemoryAdapter.ts
 *
 * Adapter for Supermemory (permanent cross-session memory).
 * Prioritizes self-hosted API at localhost:3000 and falls back to data/memory.json.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SUPERMEMORY_API = 'http://localhost:3000/api';
const FALLBACK_FILE = join(process.cwd(), 'data', 'memory.json');

export interface MemoryEntry {
  key: string;
  value: string;
  ts: number;
}

export interface MemoryStore {
  entries: MemoryEntry[];
}

/**
 * Health check for Supermemory server.
 */
export async function isSupermemoryAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPERMEMORY_API}/health`, { signal: AbortSignal.timeout(500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Save a memory entry to Supermemory or local fallback.
 */
export async function saveMemory(key: string, value: string): Promise<void> {
  const entry: MemoryEntry = { key, value, ts: Date.now() };

  if (await isSupermemoryAvailable()) {
    try {
      const res = await fetch(`${SUPERMEMORY_API}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (res.ok) return;
    } catch {
      // Fallback
    }
  }

  // Local fallback
  saveToLocalFallback(entry);
}

/**
 * Recall memory entries matching a query.
 */
export async function recallMemory(query: string): Promise<string[]> {
  if (await isSupermemoryAvailable()) {
    try {
      const res = await fetch(`${SUPERMEMORY_API}/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json() as { results: string[] };
        return data.results || [];
      }
    } catch {
      // Fallback
    }
  }

  // Local fallback: search by key or inclusion in value
  const store = getLocalStore();
  return store.entries
    .filter(e => e.key.includes(query) || e.value.includes(query))
    .map(e => e.value);
}

function getLocalStore(): MemoryStore {
  if (!existsSync(FALLBACK_FILE)) {
    return { entries: [] };
  }
  try {
    return JSON.parse(readFileSync(FALLBACK_FILE, 'utf-8'));
  } catch {
    return { entries: [] };
  }
}

function saveToLocalFallback(entry: MemoryEntry): void {
  const dataDir = join(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const store = getLocalStore();
  // Update if key exists, otherwise add
  const index = store.entries.findIndex(e => e.key === entry.key);
  if (index >= 0) {
    store.entries[index] = entry;
  } else {
    store.entries.push(entry);
  }

  writeFileSync(FALLBACK_FILE, JSON.stringify(store, null, 2));
}
