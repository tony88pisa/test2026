let currentConfig = {
  minimumMessageTokensToInit: 10000,
  minimumTokensBetweenUpdate: 5000,
  toolCallsBetweenUpdates: 3,
};

export function setSessionMemoryConfig(config: any): void {
  console.log('[CAMELOT_LOCAL] setSessionMemoryConfig called', config)
  currentConfig = { ...currentConfig, ...config };
}

export function getSessionMemoryConfig(): any {
  return currentConfig;
}

export function getSessionMemoryContent(): string {
  return 'Session memory content (STUB)'
}

export function waitForSessionMemoryExtraction(): Promise<void> {
  return Promise.resolve()
}

export function resetSessionMemoryState(): void {
  console.log('[CAMELOT_LOCAL] resetSessionMemoryState called')
  currentConfig = {
    minimumMessageTokensToInit: 10000,
    minimumTokensBetweenUpdate: 5000,
    toolCallsBetweenUpdates: 3,
  };
}
