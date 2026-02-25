import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPool } from '../../src/agents/agent-pool.js';
import type { AgentTask, PipelineEvent } from '../../src/agents/types.js';

vi.mock('../../src/utils/ai-client.js', () => ({
  createReview: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      findings: [
        { type: 'bug', severity: 'warning', file: 'test.ts', line: 1, title: 'Test', description: 'Test finding' },
      ],
      suggestions: [],
    }),
    model: 'claude-sonnet',
    inputTokens: 50,
    outputTokens: 30,
  }),
  resolveModel: vi.fn((m: string) => m),
  resetClient: vi.fn(),
}));

describe('AgentPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create tasks with unique IDs', () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });
    const task1 = pool.createTask({
      role: 'reviewer',
      priority: 'normal',
      description: 'Task 1',
      prompt: 'Review this',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });
    const task2 = pool.createTask({
      role: 'tester',
      priority: 'normal',
      description: 'Task 2',
      prompt: 'Test this',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });

    expect(task1.id).toBeDefined();
    expect(task2.id).toBeDefined();
    expect(task1.id).not.toBe(task2.id);
  });

  it('should execute independent tasks in parallel', async () => {
    const events: PipelineEvent[] = [];
    const pool = new AgentPool({
      provider: 'claude-code',
      maxConcurrent: 3,
      onEvent: (e) => events.push(e),
    });

    const task1 = pool.createTask({
      role: 'reviewer',
      priority: 'normal',
      description: 'Task 1',
      prompt: 'Review code',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });

    const task2 = pool.createTask({
      role: 'tester',
      priority: 'normal',
      description: 'Task 2',
      prompt: 'Test code',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });

    const results = await pool.executeTasks([task1, task2]);

    expect(results.size).toBe(2);
    expect(results.get(task1.id)!.status).toBe('completed');
    expect(results.get(task2.id)!.status).toBe('completed');

    const startEvents = events.filter((e) => e.type === 'task:started');
    expect(startEvents.length).toBe(2);
  });

  it('should respect task dependencies', async () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 3 });

    const task1 = pool.createTask({
      role: 'reviewer',
      priority: 'normal',
      description: 'Task 1',
      prompt: 'Review first',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });

    const task2 = pool.createTask({
      role: 'developer',
      priority: 'normal',
      description: 'Task 2 depends on Task 1',
      prompt: 'Develop after review',
      context: {},
      dependsOn: [task1.id],
      timeoutMs: 30000,
    });

    const results = await pool.executeTasks([task1, task2]);

    expect(results.size).toBe(2);
    // Task 2 should complete after Task 1
    const r1 = results.get(task1.id)!;
    const r2 = results.get(task2.id)!;
    expect(r1.meta.completedAt).toBeLessThanOrEqual(r2.meta.startedAt);
  });

  it('should parse findings from agent output', async () => {
    const pool = new AgentPool({ provider: 'claude-code', maxConcurrent: 1 });

    const task = pool.createTask({
      role: 'reviewer',
      priority: 'normal',
      description: 'Parse test',
      prompt: 'Review',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });

    const results = await pool.executeTasks([task]);
    const result = results.get(task.id)!;

    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0].type).toBe('bug');
    expect(result.findings[0].severity).toBe('warning');
  });

  it('should execute a single additional task', async () => {
    const events: PipelineEvent[] = [];
    const pool = new AgentPool({
      provider: 'claude-code',
      maxConcurrent: 1,
      onEvent: (e) => events.push(e),
    });

    const task = pool.createTask({
      role: 'developer',
      priority: 'high',
      description: 'Dynamic task',
      prompt: 'Fix this',
      context: {},
      dependsOn: [],
      timeoutMs: 30000,
    });

    const result = await pool.executeOne(task);

    expect(result.status).toBe('completed');
    expect(result.role).toBe('developer');

    const spawnedEvents = events.filter((e) => e.type === 'task:spawned');
    expect(spawnedEvents.length).toBe(1);
  });
});
