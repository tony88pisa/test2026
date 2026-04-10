import { describe, it, expect, beforeEach } from 'bun:test';
import { 
  isCoordinatorMode, 
  getCoordinatorSystemPrompt, 
  getCoordinatorWorkerLimit,
  matchSessionMode
} from '../../coordinator/coordinatorMode.js';

describe('Coordinator Mode Logic', () => {
  beforeEach(() => {
    delete process.env.CAMELOT_LOCAL;
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE;
    delete process.env.CAMELOT_COORDINATOR_WORKERS;
  });

  describe('isCoordinatorMode con CAMELOT_LOCAL', () => {
    it('CAMELOT_LOCAL=1 → isCoordinatorMode() === true', () => {
      process.env.CAMELOT_LOCAL = '1';
      expect(isCoordinatorMode()).toBe(true);
    });

    it('CAMELOT_LOCAL=0, CLAUDE_CODE_COORDINATOR_MODE non settato → false', () => {
      process.env.CAMELOT_LOCAL = '0';
      expect(isCoordinatorMode()).toBe(false);
    });
  });

  describe('getCoordinatorSystemPrompt locale', () => {
    it('should contain branded strings and local mode info', () => {
      process.env.CAMELOT_LOCAL = '1';
      const prompt = getCoordinatorSystemPrompt();
      expect(prompt).toContain('Camelot');
      expect(prompt).not.toContain('Claude Code');
      expect(prompt).toContain('gemma4:latest');
      expect(prompt).toContain('Local Mode');
    });
  });

  describe('worker limit', () => {
    it('CAMELOT_COORDINATOR_WORKERS non settato → limit === 3', () => {
      expect(getCoordinatorWorkerLimit()).toBe(3);
    });

    it('CAMELOT_COORDINATOR_WORKERS=5 → limit === 5', () => {
      process.env.CAMELOT_COORDINATOR_WORKERS = '5';
      expect(getCoordinatorWorkerLimit()).toBe(5);
    });

    it('CAMELOT_COORDINATOR_WORKERS=1 → limit === 1', () => {
      process.env.CAMELOT_COORDINATOR_WORKERS = '1';
      expect(getCoordinatorWorkerLimit()).toBe(1);
    });
  });

  describe('matchSessionMode', () => {
    it('sessionMode="coordinator", CAMELOT_LOCAL=1 → nessun warning', () => {
      process.env.CAMELOT_LOCAL = '1';
      expect(matchSessionMode('coordinator')).toBeUndefined();
    });

    it('sessionMode="normal", CAMELOT_LOCAL=1 → warning string', () => {
      process.env.CAMELOT_LOCAL = '1';
      const warning = matchSessionMode('normal');
      expect(typeof warning).toBe('string');
      expect(warning).toContain('recommended');
    });
  });
});
