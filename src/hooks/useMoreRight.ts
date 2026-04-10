/**
 * src/hooks/useMoreRight.ts
 *
 * Intercepts chat queries and responses.
 */

import { saveMemory } from '../memory/supermemoryAdapter.js';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const FALLBACK_FILE = join(process.cwd(), 'data', 'memory.json');

export function useMoreRight(args: {
  enabled: boolean;
  setMessages: (action: any) => void;
  inputValue: string;
  setInputValue: (s: string) => void;
  setToolJSX: (args: any) => void;
}) {
  return {
    onBeforeQuery: async (input: string, all: any[], n: number) => {
      // 1. Log query in data/memory.json if CAMELOT_LOCAL=1
      if (process.env.CAMELOT_LOCAL === '1') {
        const logEntry = `[${new Date().toISOString()}] QUERY: ${input}\n`;
        const dataDir = join(process.cwd(), 'data');
        if (!existsSync(dataDir)) {
          mkdirSync(dataDir, { recursive: true });
        }
        appendFileSync(FALLBACK_FILE + '.log', logEntry);
      }

      // 2. if input starts with "!dream" → activate autoDream
      if (input.startsWith('!dream')) {
        process.env.CAMELOT_AUTODREAM = 'true';
        console.log('[CAMELOT] autoDream attivato via !dream');
      }

      // Always return true (don't block)
      return true;
    },

    onTurnComplete: async (all: any[], aborted: boolean) => {
      // 1. Save last turn in Supermemory via saveMemory()
      if (all.length >= 2) {
        const lastUser = all[all.length - 2];
        const lastAssistant = all[all.length - 1];
        const summary = `U: ${lastUser.content}\nA: ${lastAssistant.content}`;
        await saveMemory('last_turn', summary);
      }

      // 2. If aborted → log "[CAMELOT] Turn abortato"
      if (aborted) {
        console.log('[CAMELOT] Turn abortato');
      }

      // 3. Update contatore turns in SESSION_MEMORY (simulation/local log)
      if (process.env.CAMELOT_LOCAL === '1') {
        // Here we could update a global counter or just log it
      }
    },

    render: () => null
  };
}
