/**
 * disableAutoDream.ts
 *
 * Disables background memory consolidation (autoDream) for Ollama locale.
 *
 * WHY: autoDream fires runForkedAgent() with a consolidation prompt when
 * the IDE is idle — this would attempt a costly LLM call in background.
 * With Ollama locale: risk of OOM on VRAM while the user is running
 * another task in foreground.
 *
 * HOW IT WORKS UPSTREAM (from reading autoDream.ts):
 *   isGateOpen() checks:
 *     1. getKairosActive() → false for local
 *     2. getIsRemoteMode() → false for local
 *     3. isAutoMemoryEnabled() → depends on memdir config
 *     4. isAutoDreamEnabled() → GrowthBook 'tengu_onyx_plover' default=false
 *
 *   isAutoDreamEnabled() (from config.ts):
 *     1. Reads settings.autoDreamEnabled → if undefined, falls to GrowthBook
 *     2. GrowthBook 'tengu_onyx_plover' → default null → gb?.enabled === true → false
 *
 * CONCLUSION: autoDream is already disabled by default (GrowthBook returns false).
 * This patch adds an explicit env-var guard as defense-in-depth.
 *
 * DECISION #11: Do NOT redirect to Ollama — risk of OOM during active tasks.
 * Future: re-enable with queued Ollama calls after MVP is stable.
 */

/**
 * Ensure autoDream is disabled for local Ollama sessions.
 * Called from enableLocalMemory.ts at startup.
 *
 * Sets env var that can be checked by a patched isAutoDreamEnabled():
 *   if (process.env.CAMELOT_AUTODREAM === 'false') return false
 */
export function disableAutoDream(): void {
  process.env.CAMELOT_AUTODREAM = 'false'
}

/**
 * Document: upstream isAutoDreamEnabled() in config.ts would need this 1-line patch
 * to respect the env var:
 *
 * --- a/services/autoDream/config.ts
 * +++ b/services/autoDream/config.ts
 * @@ -17,6 +17,7 @@
 *  export function isAutoDreamEnabled(): boolean {
 * +  if (process.env.CAMELOT_AUTODREAM === 'false') return false
 *    const setting = getInitialSettings().autoDreamEnabled
 *    if (setting !== undefined) return setting
 *
 * NOTE: Without this upstream patch, autoDream is still disabled
 * because GrowthBook returns false by default. The env var is
 * defense-in-depth for cases where settings.json has autoDreamEnabled: true.
 */
