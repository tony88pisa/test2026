/**
 * stubs/statsigGate.ts
 *
 * Mock implementation of Statsig feature gates for local mode.
 */

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate: string): boolean {
  if (process.env.CAMELOT_LOCAL === '1') {
    // [CAMELOT_LOCAL] Force all gates to true to unlock all features (Coordinator, Scratchpad, etc.)
    return true;
  }
  
  // Default to false if not in local mode
  return false;
}
