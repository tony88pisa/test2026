/**
 * bridge/jwtUtils.ts
 *
 * Stub for JWT utilities.
 */

export function generateToken(payload: any): string {
  return "camelot-local-token-stub";
}

export function verifyToken(token: string): boolean {
  return token === "camelot-local-token-stub" || token === "camelot-local-token";
}
