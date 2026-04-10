/**
 * skills/bundled/remember.ts
 */

import { saveMemory, recallMemory } from '../../src/memory/supermemoryAdapter.js';

export async function saveContext(key: string, value: string): Promise<void> {
  await saveMemory(key, value);
}

export async function recallContext(query: string): Promise<string[]> {
  return await recallMemory(query);
}
