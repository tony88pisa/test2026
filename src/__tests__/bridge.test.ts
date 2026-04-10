/**
 * src/__tests__/bridge.test.ts
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { isBridgeEnabled } from '../../stubs/bridgeLocalBypass.js';
import { mockJwt, getLocalBridgeConfig } from '../../stubs/bridgeLocalBypass.js';
import { isBridgeEnabled as rawIsBridgeEnabled } from '../../bridge/bridgeEnabled.js';

describe('Bridge Local Bypass', () => {
  beforeEach(() => {
    delete process.env.CAMELOT_LOCAL;
  });

  it('should return false for isBridgeEnabled when CAMELOT_LOCAL is 1', () => {
    process.env.CAMELOT_LOCAL = '1';
    expect(isBridgeEnabled()).toBe(false);
    expect(rawIsBridgeEnabled()).toBe(false);
  });

  it('should return a non-empty mock JWT', () => {
    const jwt = mockJwt();
    expect(typeof jwt).toBe('string');
    expect(jwt.length).toBeGreaterThan(0);
    expect(jwt).toBe('camelot-local-token');
  });

  it('should return the correct local bridge config', () => {
    const config = getLocalBridgeConfig();
    expect(config.endpoint).toBe('http://localhost:11434');
    expect(config.model).toBe('gemma4:latest');
  });
});
