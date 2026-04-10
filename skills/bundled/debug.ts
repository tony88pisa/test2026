/**
 * skills/bundled/debug.ts
 */

export function dumpState(history: any[]): void {
  console.log('\n|-----------------------------------------|');
  console.log('|          Camelot-IDE — Debug            |');
  console.log('|-----------------------------------------|');
  console.log(`|  Messaggi: ${String(history.length).padEnd(28)}|`);
  console.log(`|  Turns:    ${String(history.length / 2).padEnd(28)}|`);
  console.log(`|  Local:    ${(process.env.CAMELOT_LOCAL === '1' ? 'Sì' : 'No').padEnd(28)}|`);
  console.log('|-----------------------------------------|');
}

export function traceLastTurn(history: any[]): void {
  if (history.length < 2) return;
  const lastUser = history[history.length - 2];
  const lastAssistant = history[history.length - 1];
  console.log('\n[TRACE] Ultimo Turno:');
  console.log(`[USER] ${lastUser.content.slice(0, 100)}...`);
  console.log(`[ASSISTANT] ${lastAssistant.content.slice(0, 100)}...`);
}
