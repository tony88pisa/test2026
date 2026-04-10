/**
 * coordinator/coordinatorMode.ts
 *
 * Checks if the system should operate in multi-agent (Coordinator) mode.
 * Rebranded for Camelot-IDE.
 */

function isEnvTruthy(val: string | undefined): boolean {
  return val === '1' || val === 'true';
}

export function isCoordinatorMode(): boolean {
  // CAMELOT_LOCAL: forza sempre coordinator mode attivo
  if (process.env.CAMELOT_LOCAL === '1') return true;
  
  // Local implementation of feature gate check
  const coordinatorEnv = process.env.CLAUDE_CODE_COORDINATOR_MODE;
  return isEnvTruthy(coordinatorEnv);
}

export function getCoordinatorSystemPrompt(): string {
  const workers = process.env.CAMELOT_COORDINATOR_WORKERS ?? '3';
  return `## Local Mode
Running with Ollama (gemma4:latest). Max ${workers} parallel workers.

Sei Camelot, un Coordinator agentico locale.
Il tuo compito è coordinare i worker agenti per risolvere il task dell'utente.
Usa camelot-local per la gestione dei sotto-processi.
Mantieni un approccio preciso e professionale.`;
}

export function getCoordinatorWorkerLimit(): number {
  return parseInt(process.env.CAMELOT_COORDINATOR_WORKERS ?? '3', 10);
}

export function getCoordinatorUserContext(): string {
  const limit = getCoordinatorWorkerLimit();
  return `Contesto coordinator: ${limit} worker disponibili in parallelo.`;
}

export function matchSessionMode(sessionMode: string): string | undefined {
  if (process.env.CAMELOT_LOCAL === '1' && sessionMode === 'normal') {
    return 'CAMELOT_LOCAL is active. It is recommended to use coordinator mode.';
  }
  return undefined;
}
