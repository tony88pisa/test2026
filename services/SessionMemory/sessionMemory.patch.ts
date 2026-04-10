/**
 * sessionMemory.patch.ts
 *
 * QUESTO FILE NON VA ESEGUITO — è documentazione della modifica da applicare
 * a services/SessionMemory/sessionMemory.ts nel repo upstream.
 *
 * === MODIFICA RICHIESTA (1 riga) ===
 *
 * File: services/SessionMemory/sessionMemory.ts
 * Funzione: isSessionMemoryGateEnabled() (riga 84-86)
 *
 * --- PRIMA (originale) ---
 *
 *   function isSessionMemoryGateEnabled(): boolean {
 *     return getFeatureValue_CACHED_MAY_BE_STALE('tengu_session_memory', false)
 *   }
 *
 * --- DOPO (con env var override) ---
 *
 *   function isSessionMemoryGateEnabled(): boolean {
 *     return process.env.CAMELOT_SESSION_MEMORY === 'true'
 *       || getFeatureValue_CACHED_MAY_BE_STALE('tengu_session_memory', false)
 *   }
 *
 * === MOTIVAZIONE ===
 *
 * - Growthbook non è disponibile per sessioni Ollama locali
 * - L'env var CAMELOT_SESSION_MEMORY è impostata da enableLocalMemory()
 * - Il check originale Growthbook resta come fallback per sessioni cloud
 * - Nessun impatto su utenti esistenti (env var non è impostata di default)
 */

// Questo file serve solo come documentazione.
// La modifica va applicata manualmente al repo upstream.
export {}
