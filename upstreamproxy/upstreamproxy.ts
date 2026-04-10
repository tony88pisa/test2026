/**
 * upstreamproxy/upstreamproxy.ts
 */

export { relayRequest } from './relay.js'

export function initUpstreamProxy(): void {
  if (process.env.CAMELOT_LOCAL === '1') return;
}

export function isProxyActive(): boolean {
  return false;
}
