/**
 * skills/bundled/loop.ts
 */

import type { QueryDeps } from '../../query/deps.js';

export async function runUntil(
  query: string, 
  condition: string, 
  maxTurns: number,
  deps: QueryDeps,
  handleQuery: (input: string, deps: QueryDeps, history: any[]) => Promise<void>,
  history: any[]
): Promise<void> {
  let turns = 0;
  while (turns < maxTurns) {
    turns++;
    console.log(`\n[LOOP] Turno ${turns}/${maxTurns}...`);
    
    const prevLen = history.length;
    await handleQuery(query, deps, history);
    
    const lastAssistant = history[history.length - 1];
    if (lastAssistant && lastAssistant.content.includes(condition)) {
      console.log(`\n[LOOP] Condizione "${condition}" soddisfatta!`);
      break;
    }
  }
}
