/**
 * skills/claudeApi.ts
 *
 * Passive stub for Claude API (local-first bypass).
 */

export async function callClaudeApi(prompt: string): Promise<string> {
  // Always return empty string in local mode
  if (process.env.CAMELOT_LOCAL === '1') {
    return "";
  }
  return "";
}
