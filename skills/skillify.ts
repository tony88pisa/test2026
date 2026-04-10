/**
 * skills/skillify.ts
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const FALLBACK_FILE = join(process.cwd(), 'data', 'memory.json');

export function skillify<T extends (...args: any[]) => any>(
  name: string,
  fn: T
): T & { skillName: string } {
  const wrapped = (...args: any[]) => {
    // Logga invocazione in data/memory.json (appending a .log side-file for simplicity)
    if (process.env.CAMELOT_LOCAL === '1') {
      const logEntry = `[${new Date().toISOString()}] SKILL: ${name} CALLED\n`;
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      appendFileSync(FALLBACK_FILE + '.log', logEntry);
    }
    return fn(...args);
  };

  return Object.assign(wrapped as T, { skillName: name });
}
