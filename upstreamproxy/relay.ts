import { isLocalMode, ollamaChatRequest } from '../src/remote/localBridge.js'

export async function relayRequest(
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number }
) {
  if (isLocalMode()) {
    return await ollamaChatRequest(messages as any, options)
  }
  // Upstream remoto non disponibile in local mode
  return {
    model: 'none',
    message: { role: 'assistant', content: '' },
    done: true,
    error: 'Remote upstream disabled in local mode',
  }
}

export function startRelay(): void {
  if (process.env.CAMELOT_LOCAL === '1') return;
  // no-op in local mode
}

export function stopRelay(): void {}
