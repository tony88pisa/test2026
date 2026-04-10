/**
 * bridge/workSecret.ts
 *
 * Stub for work secret logic.
 */

export function getWorkSecret(): string {
  return "camelot-local-secret";
}

export function deriveKey(secret: string): string {
  return `derived-${secret}`;
}
