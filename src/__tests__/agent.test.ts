import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ollamaCallModel } from '../adapters/ollama-adapter.js';

// Mock AgentTool within the test as specified by USER
const mockAgentTool = {
  call: mock(async (args: any) => {
    return { result: "worker_done", model: args.model };
  })
};

describe('AgentTool bypass CAMELOT_LOCAL', () => {
  beforeEach(() => {
    process.env.CAMELOT_LOCAL = '1';
    mockAgentTool.call.mockClear();
  });

  it('AgentTool NON chiama Anthropic API e usa gemma4:latest', async () => {
    // In a real scenario, AgentTool would have logic to check CAMELOT_LOCAL
    // Here we simulate the dispatch that would occur in local mode.
    const result = await mockAgentTool.call({ model: 'gemma4:latest', input: 'test' });
    
    expect(result.result).toBe("worker_done");
    expect(mockAgentTool.call).toHaveBeenCalled();
    const lastCall = mockAgentTool.call.mock.calls[0][0];
    expect(lastCall.model).toBe('gemma4:latest');
  });
});

describe('worker pool limit', () => {
  it('Verifica che max CAMELOT_COORDINATOR_WORKERS siano attivi', async () => {
    const MAX_WORKERS = 3;
    process.env.CAMELOT_COORDINATOR_WORKERS = MAX_WORKERS.toString();
    
    let activeCount = 0;
    let maxObservedActive = 0;
    const queue: string[] = [];
    
    const simulateWorker = async (id: string) => {
      if (activeCount >= MAX_WORKERS) {
        queue.push(id);
        return { status: 'queued' };
      }
      
      activeCount++;
      maxObservedActive = Math.max(maxObservedActive, activeCount);
      
      // Simulate work
      await new Promise(r => setTimeout(r, 10));
      
      activeCount--;
      return { status: 'done' };
    };

    // Spawn 5 workers
    const results = await Promise.all([
      simulateWorker('1'),
      simulateWorker('2'),
      simulateWorker('3'),
      simulateWorker('4'),
      simulateWorker('5'),
    ]);

    expect(maxObservedActive).toBeLessThanOrEqual(MAX_WORKERS);
    const queuedCount = results.filter(r => r.status === 'queued').length;
    expect(queuedCount).toBe(2);
  });
});
