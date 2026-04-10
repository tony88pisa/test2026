/**
 * bridge/bridgeConfig.ts
 *
 * Stub for bridge configuration files.
 */

export interface BridgeConfig {
  endpoint: string;
  model: string;
}

export function getBridgeConfig(): BridgeConfig {
  return {
    endpoint: "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "gemma4:latest"
  };
}
