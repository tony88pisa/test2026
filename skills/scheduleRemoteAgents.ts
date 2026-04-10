/**
 * skills/scheduleRemoteAgents.ts
 *
 * Passive stub for remote agent scheduling (local-first bypass).
 */

export async function scheduleRemoteAgent(task: string): Promise<void> {
  // No-op in local mode
  if (process.env.CAMELOT_LOCAL === '1') {
    return;
  }
}
