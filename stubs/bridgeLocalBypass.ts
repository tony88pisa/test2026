/**
 * stubs/bridgeLocalBypass.ts
 *
 * Mocks for bridge infrastructure to bypass remote Anthropic calls.
 */

import { getBridgeConfig } from '../bridge/bridgeConfig.js';
import { isBridgeEnabled as originalIsBridgeEnabled } from '../bridge/bridgeEnabled.js';

export function mockJwt(): string {
  return "camelot-local-token";
}

export function mockWorkSecret(): string {
  return "camelot-local-secret";
}

export function isBridgeEnabled(): boolean {
  // If CAMELOT_LOCAL is 1, always return false for the remote bridge
  if (process.env.CAMELOT_LOCAL === '1') {
    return false;
  }
  return originalIsBridgeEnabled();
}

export function getLocalBridgeConfig() {
  const config = getBridgeConfig();
  return {
    endpoint: config.endpoint,
    model: config.model
  };
}
