/**
 * skills/bundled/stuck.ts
 */

export function isStuck(history: string[]): boolean {
  if (history.length < 3) return false;
  
  // Get last 3 assistant responses
  const assistantResponses = history.filter((_, i) => i % 2 !== 0).slice(-3);
  if (assistantResponses.length < 3) return false;

  const last = assistantResponses[2];
  const secondLast = assistantResponses[1];
  const thirdLast = assistantResponses[0];

  const overlap = (s1: string, s2: string) => {
    const words1 = new Set(s1.split(/\s+/));
    const words2 = s2.split(/\s+/);
    const matches = words2.filter(w => words1.has(w));
    return matches.length / Math.max(words1.size, words2.length);
  };

  const score1 = overlap(last, secondLast);
  const score2 = overlap(last, thirdLast);

  return score1 > 0.7 && score2 > 0.7;
}

export function unstick(): string {
  return "Approccio alternativo: ";
}
