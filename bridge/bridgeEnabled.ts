/**
 * bridge/bridgeEnabled.ts
 *
 * Checks if the bridge is enabled.
 */

export function isBridgeEnabled(): boolean {
  // If CAMELOT_LOCAL is 1, the remote bridge is always disabled (Decision #16)
  if (process.env.CAMELOT_LOCAL === '1') {
    return false;
  }
  
  // Default to false for security in local-first environment
  return false;
}
