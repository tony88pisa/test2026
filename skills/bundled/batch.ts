/**
 * skills/bundled/batch.ts
 */

import type { QueryDeps } from '../../query/deps.js';

export async function runBatch(
  queries: string[],
  deps: QueryDeps,
  handleQuery: (input: string, deps: QueryDeps, history: any[]) => Promise<void>,
  history: any[]
): Promise<void> {
  console.log(`\n[BATCH] Esecuzione di ${queries.length} query...`);
  for (let i = 0; i < queries.length; i++) {
    console.log(`\n[BATCH] [${i + 1}/${queries.length}] Query: ${queries[i]}`);
    await handleQuery(queries[i], deps, history);
  }
  console.log(`\n[BATCH] Completato.`);
}
