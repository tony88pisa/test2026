import { describe, it, expect, beforeEach, spyOn } from 'bun:test';
import * as localBridge from '../remote/localBridge.js';
import { buildLocalCompanion, generateSoulLocal, companionUserId } from '../buddy/localCompanion.js';

describe('Buddy System', () => {
  let chatSpy: any;

  beforeEach(() => {
    process.env.CAMELOT_LOCAL = '1';
    // Clear all mocks
    if (chatSpy) chatSpy.mockRestore();
    chatSpy = spyOn(localBridge, 'ollamaChatRequest');
  });

  describe('buildLocalCompanion shiny CAMELOT_LOCAL', () => {
    it('CAMELOT_LOCAL=1 → companion.shiny === true sempre', async () => {
      chatSpy.mockImplementation(async () => ({
        model: 'gemma4:latest',
        message: { role: 'assistant', content: '{"name":"TestBuddy","personality":"helpful"}' },
        done: true
      }));

      const companion = await buildLocalCompanion('test-user');
      expect(companion.shiny).toBe(true);
      expect(companion.name).toBe('TestBuddy');
      expect(companion.personality).toBe('helpful');
    });
  });

  describe('generateSoulLocal fallback', () => {
    it('Mock ollamaChatRequest → risposta non-JSON → deve usare fallback', async () => {
      chatSpy.mockImplementation(async () => ({
        model: 'gemma4:latest',
        message: { role: 'assistant', content: 'Err: Not a JSON' },
        done: true
      }));

      const bones = {
        rarity: 'common' as const,
        species: 'duck' as const,
        eye: '·' as const,
        hat: 'none' as const,
        shiny: false,
        stats: { DEBUGGING: 10, PATIENCE: 10, CHAOS: 10, WISDOM: 10, SNARK: 10 }
      };

      const soul = await generateSoulLocal(bones);
      expect(soul.name).toBeDefined();
      expect(soul.personality).toBeDefined();
    });
  });

  describe('generateSoulLocal con JSON valido', () => {
    it('Mock risposta: {"name":"Ziggy","personality":"chaotic"}', async () => {
      chatSpy.mockImplementation(async () => ({
        model: 'gemma4:latest',
        message: { role: 'assistant', content: '{"name":"Ziggy","personality":"chaotic"}' },
        done: true
      }));

      const bones = {
        rarity: 'rare' as const,
        species: 'cat' as const,
        eye: '✦' as const,
        hat: 'beanie' as const,
        shiny: true,
        stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 }
      };

      const soul = await generateSoulLocal(bones);
      expect(soul.name).toBe('Ziggy');
      expect(soul.personality).toBe('chaotic');
    });
  });
});

describe('API structure mock', () => {
  it('Verifica che buildLocalCompanion ritorni campi corretti', async () => {
    const spy = spyOn(localBridge, 'ollamaChatRequest').mockImplementation(async () => ({
      model: 'gemma4:latest',
      message: { role: 'assistant', content: '{"name":"Mochi","personality":"lazy"}' },
      done: true
    }));

    const companion = await buildLocalCompanion(companionUserId());
    expect(companion).toHaveProperty('name');
    expect(companion).toHaveProperty('species');
    expect(companion).toHaveProperty('rarity');
    expect(companion).toHaveProperty('stats');
    expect(companion).toHaveProperty('shiny');
    expect(companion).toHaveProperty('personality');
    
    spy.mockRestore();
  });
});
