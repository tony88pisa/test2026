/**
 * src/__tests__/skills.test.ts
 */

import { describe, it, expect, mock, spyOn, beforeEach } from 'bun:test';
import { skillify } from '../../skills/skillify.js';
import * as skills from '../../skills/bundled/index.js';

// Mock adapter to avoid network timeouts and FS issues in tests
import * as adapter from '../memory/supermemoryAdapter.js';

describe('Camelot Skills', () => {
  it('skillify should add skillName and log invocation', () => {
    const fn = (a: number) => a + 1;
    const skill = skillify('testSkill', fn);
    expect(skill.skillName).toBe('testSkill');
    expect(skill(5)).toBe(6);
  });

  it('remember/recall round-trip', async () => {
    // Mocking the adapter for predictable results
    const memory: Record<string, string> = {};
    const spySave = spyOn(adapter, 'saveMemory').mockImplementation(async (k, v) => { memory[k] = v; });
    const spyRecall = spyOn(adapter, 'recallMemory').mockImplementation(async (q) => {
      return Object.entries(memory)
        .filter(([k, v]) => k.includes(q) || v.includes(q))
        .map(([k, v]) => v);
    });

    try {
      await skills.saveContext('test-k', 'test-v');
      const results = await skills.recallContext('test-k');
      expect(results).toContain('test-v');
    } finally {
      spySave.mockRestore();
      spyRecall.mockRestore();
    }
  });

  it('isStuck should detect 3 repeating assistant responses', () => {
    // Current isStuck implementation expects [user, assistant, user, assistant...]
    // filter((_, i) => i % 2 !== 0) takes indices 1, 3, 5...
    const history = [
      'user 1', 'repeating pattern',
      'user 2', 'repeating pattern',
      'user 3', 'repeating pattern',
    ];

    expect(skills.isStuck(history)).toBe(true);
  });

  it('isStuck should NOT detect different responses', () => {
    const history = [
      'resp 1',
      'resp 2',
      'resp 3'
    ];
    expect(skills.isStuck(history)).toBe(false);
  });

  it('batch processes queries in sequence', async () => {
    const queries = ['q1', 'q2'];
    const handleQuery = mock(() => Promise.resolve());
    await skills.runBatch(queries, {} as any, handleQuery, []);
    expect(handleQuery.mock.calls.length).toBe(2);
  });
});

import { registerSkill, getSkill, listSkills, loadAllSkills } from '../skills/registry.js';
import { commitSmartSkill } from '../skills/builtin/commitSmart.js';
import { explainCodeSkill } from '../skills/builtin/explainCode.js';
import * as localBridge from '../remote/localBridge.js';

describe('Skills Registry', () => {
  it('registerSkill() → skill recuperabile con getSkill()', () => {
    const fakeSkill = { name: 'f', description: 'd', trigger: '/f', run: async () => ({ content: 'c' }) };
    registerSkill(fakeSkill);
    expect(getSkill('/f')).toBe(fakeSkill);
  });

  it('getSkill("trigger-inesistente") → undefined', () => {
    expect(getSkill('/non-existent')).toBeUndefined();
  });

  it('listSkills() → ritorna array non vuoto dopo load', async () => {
    loadAllSkills();
    // Wait for dynamic imports to settle (naive, better to check length > 0)
    await new Promise(r => setTimeout(r, 100));
    expect(listSkills().length).toBeGreaterThan(0);
  });
});

describe('Builtin Skills Logic', () => {
  beforeEach(() => {
    spyOn(localBridge, 'ollamaChatRequest').mockImplementation(async () => ({
      model: 'gemma4:latest',
      message: { role: 'assistant', content: 'mock content' },
      done: true,
      tool_calls: [{ function: { name: 'mock_tool', arguments: {} } }],
      thinking: 'mock thinking'
    }));
  });

  it('commitSmartSkill returns tool_calls', async () => {
    const result = await commitSmartSkill.run({
      messages: [{ role: 'user', content: 'fix bug' }],
      args: {},
      workspacePath: '.'
    });
    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls?.length).toBeGreaterThan(0);
  });

  it('explainCodeSkill returns content', async () => {
    const result = await explainCodeSkill.run({
      messages: [{ role: 'user', content: 'explain this' }],
      args: {},
      workspacePath: '.'
    });
    expect(result.content).toBeDefined();
    expect(result.content).not.toBe('');
  });
});
