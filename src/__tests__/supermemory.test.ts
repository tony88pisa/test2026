import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import { isSupermemoryAvailable, saveMemory, recallMemory } from '../memory/supermemoryAdapter.js';
import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const FALLBACK_FILE = join(process.cwd(), 'data', 'memory.json');

describe('Supermemory Integration', () => {
  beforeEach(() => {
    // Reset local fallback file safely
    try {
      if (existsSync(FALLBACK_FILE)) {
        unlinkSync(FALLBACK_FILE);
      }
    } catch {}
    const dataDir = join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  });

  it('isSupermemoryAvailable should return false when server is down', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('Network error')));
    const available = await isSupermemoryAvailable();
    expect(available).toBe(false);
    fetchSpy.mockRestore();
  });

  it('saveMemory should fallback to local file when server is down', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('Network error')));
    
    await saveMemory('test-key', 'test-value');
    
    expect(existsSync(FALLBACK_FILE)).toBe(true);
    const store = JSON.parse(readFileSync(FALLBACK_FILE, 'utf-8'));
    expect(store.entries.some((e: any) => e.key === 'test-key')).toBe(true);
    fetchSpy.mockRestore();
  });

  it('recallMemory should read from local file when server is down', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('Network error')));
    
    // Manually seed the fallback file
    const entry = { key: 'test-query', value: 'secret-sauce', ts: Date.now() };
    writeFileSync(FALLBACK_FILE, JSON.stringify({ entries: [entry] }));
    
    const results = await recallMemory('test-query');
    expect(results).toContain('secret-sauce');
    fetchSpy.mockRestore();
  });

  it('recallMemory should search in values too', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('Network error')));
    
    const entry = { key: 'k1', value: 'hello world', ts: Date.now() };
    writeFileSync(FALLBACK_FILE, JSON.stringify({ entries: [entry] }));
    
    const results = await recallMemory('world');
    expect(results).toContain('hello world');
    fetchSpy.mockRestore();
  });
});
