/**
 * sessionMemory.ts (STUB)
 */
export function initSessionMemory(): void {
  console.log('[CAMELOT_LOCAL] initSessionMemory called')
}

export function shouldExtractMemory(): boolean {
  return false
}

export function manuallyExtractSessionMemory(): Promise<void> {
  return Promise.resolve()
}

export function resetLastMemoryMessageUuid(): void {
  // stub
}
