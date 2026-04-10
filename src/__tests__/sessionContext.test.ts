import { describe, it, expect, beforeEach, spyOn, mock } from 'bun:test';
import { saveMemory, recallMemory, summarizeSession } from '../memory/sessionContext.js';
import * as localBridge from '../remote/localBridge.js';

describe('SessionContext Memory', () => {
  beforeEach(() => {
    // CAMELOT_LOCAL=1 forza fallback locale
    process.env.CAMELOT_LOCAL = '1';
    process.env.SUPERMEMORY_API_KEY = '';
  });

  it('recallMemory() locale (substring match)', async () => {
    await saveMemory({
      sessionId: 's1',
      content: 'Fixing a bug in registry.ts',
      metadata: { type: 'session', timestamp: Date.now() }
    });
    
    const results = await recallMemory('registry');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('registry.ts');
  });

  it('recallMemory() con SuperMemory offline → deve usare fallback locale senza throw', async () => {
    // Simuliamo che la key ci sia ma il fetch fallisca o venga saltato
    process.env.SUPERMEMORY_API_KEY = 'mock-key';
    process.env.CAMELOT_LOCAL = '0'; // Disabilitiamo bypass locale

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('SuperMemory Down'))
    );

    try {
      // Dovrebbe fallire il ramo SuperMemory e usare localStore
      await saveMemory({
        sessionId: 's2',
        content: 'Local backup content',
        metadata: { type: 'session', timestamp: Date.now() }
      });
      
      const results = await recallMemory('backup');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('Local backup');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('summarizeSession() con mock ollamaChatRequest', async () => {
    const chatSpy = spyOn(localBridge, 'ollamaChatRequest').mockImplementation(async () => ({
      model: 'gemma4:latest',
      message: { role: 'assistant', content: 'Aggiornato il registro delle skill e ripuliti i riferimenti obsoleti.' },
      done: true
    }));

    const session = {
      id: 'sess-123',
      timestamp: Date.now(),
      files: ['registry.ts', 'server.ts'],
      summary: 'Initial summary',
      language: 'TypeScript',
      decisions: ['Cleaned up trading code']
    };

    const summary = await summarizeSession(session);
    expect(summary).toContain('Aggiornato il registro');
    expect(chatSpy).toHaveBeenCalled();
    
    chatSpy.mockRestore();
  });
});
