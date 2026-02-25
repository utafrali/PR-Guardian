import { randomUUID } from 'node:crypto';
import { createReview, type Provider } from '../utils/ai-client.js';
import { logger } from '../utils/logger.js';
import type {
  AgentTask,
  AgentResult,
  AgentRole,
  AgentFinding,
  AgentSuggestion,
  PipelineEvent,
} from './types.js';

const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT = 120_000; // 2 min

/** Validate that a parsed finding has the required shape */
function isValidFinding(f: unknown): f is AgentFinding {
  return (
    typeof f === 'object' && f !== null &&
    'severity' in f && typeof (f as AgentFinding).severity === 'string' &&
    'title' in f && typeof (f as AgentFinding).title === 'string' &&
    'description' in f && typeof (f as AgentFinding).description === 'string'
  );
}

/** Parse structured JSON from agent output (tolerant of markdown wrapping) */
function parseAgentOutput(raw: string): { findings: AgentFinding[]; suggestions: AgentSuggestion[] } {
  try {
    // Try markdown code block first, then full string, then brace extraction
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
    const toParse = jsonMatch ? jsonMatch[1] : raw;

    let parsed: unknown;
    try {
      parsed = JSON.parse(toParse);
    } catch {
      const braceMatch = raw.match(/(\{[\s\S]*\})/);
      if (!braceMatch) return { findings: [], suggestions: [] };
      parsed = JSON.parse(braceMatch[1]);
    }

    const obj = parsed as Record<string, unknown>;
    return {
      findings: Array.isArray(obj.findings) ? obj.findings.filter(isValidFinding) : [],
      suggestions: Array.isArray(obj.suggestions) ? obj.suggestions : [],
    };
  } catch {
    logger.debug('Could not parse structured output from agent, treating as raw text');
    return { findings: [], suggestions: [] };
  }
}

/** Execute a single agent task */
async function executeTask(
  task: AgentTask,
  provider: Provider,
): Promise<AgentResult> {
  const startedAt = Date.now();
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount <= MAX_RETRIES) {
    try {
      const model = typeof task.context.model === 'string' ? task.context.model : 'claude-sonnet';
      const response = await createReview(
        {
          model,
          systemPrompt: buildSystemPrompt(task.role),
          userPrompt: task.prompt,
          maxTokens: 8192,
        },
        provider,
      );

      const { findings, suggestions } = parseAgentOutput(response.content);
      const completedAt = Date.now();

      return {
        taskId: task.id,
        role: task.role,
        status: 'completed',
        rawOutput: response.content,
        findings,
        suggestions,
        meta: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
          retryCount,
          provider,
        },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;
      if (retryCount <= MAX_RETRIES) {
        logger.warn({ taskId: task.id, retry: retryCount, error: lastError.message }, 'Retrying agent task');
        // Exponential backoff with jitter
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (retryCount - 1) + Math.random() * 500));
      }
    }
  }

  const completedAt = Date.now();
  return {
    taskId: task.id,
    role: task.role,
    status: 'failed',
    rawOutput: lastError?.message || 'Unknown error',
    findings: [],
    suggestions: [],
    meta: {
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      retryCount,
      provider,
    },
  };
}

function buildSystemPrompt(role: AgentRole): string {
  const prompts: Record<AgentRole, string> = {
    orchestrator: 'You are the master orchestrator of PR Guardian. Analyze tasks and coordinate sub-agents.',
    reviewer: `You are a senior code reviewer agent. Analyze the code diff thoroughly.

Respond with valid JSON in this exact format:
{
  "findings": [
    {
      "type": "bug|security|performance|style|improvement",
      "severity": "critical|warning|nit",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Short title",
      "description": "Detailed explanation",
      "suggestedFix": "Code or description of fix"
    }
  ],
  "suggestions": [
    {
      "targetRole": "tester|developer",
      "action": "What should the other agent do",
      "reason": "Why",
      "context": {}
    }
  ]
}

Be thorough but precise. Only report real issues, not style preferences.`,

    tester: `You are a testing specialist agent. Analyze code for test coverage gaps.

Respond with valid JSON in this exact format:
{
  "findings": [
    {
      "type": "test-gap",
      "severity": "critical|warning|nit",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Missing test for X",
      "description": "Why this needs a test",
      "suggestedFix": "Test code suggestion"
    }
  ],
  "suggestions": [
    {
      "targetRole": "developer|reviewer",
      "action": "What should the other agent do",
      "reason": "Why",
      "context": {}
    }
  ]
}

Focus on: untested edge cases, missing error handling tests, critical paths without coverage.`,

    developer: `You are a development specialist agent. Analyze code and suggest improvements.

Respond with valid JSON in this exact format:
{
  "findings": [
    {
      "type": "improvement|bug|performance",
      "severity": "critical|warning|nit",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Short title",
      "description": "What should be improved and why",
      "suggestedFix": "Concrete code suggestion"
    }
  ],
  "suggestions": [
    {
      "targetRole": "reviewer|tester",
      "action": "What should the other agent do",
      "reason": "Why",
      "context": {}
    }
  ]
}

Provide concrete, implementable suggestions. Include actual code in suggestedFix.`,
  };

  return prompts[role];
}

export interface AgentPoolConfig {
  provider: Provider;
  maxConcurrent: number;
  onEvent?: (event: PipelineEvent) => void;
}

/**
 * Agent pool manages the lifecycle and execution of agent tasks.
 * Handles concurrency, retries, dependency ordering, and event emission.
 */
export class AgentPool {
  private provider: Provider;
  private maxConcurrent: number;
  private running = 0;
  private results = new Map<string, AgentResult>();
  private emitEvent: (event: PipelineEvent) => void;

  constructor(config: AgentPoolConfig) {
    this.provider = config.provider;
    this.maxConcurrent = config.maxConcurrent;
    this.emitEvent = config.onEvent || (() => {});
  }

  /** Create a new task with a unique ID */
  createTask(params: Omit<AgentTask, 'id'>): AgentTask {
    return { ...params, id: randomUUID() };
  }

  /** Execute tasks respecting dependencies and concurrency limits */
  async executeTasks(tasks: AgentTask[]): Promise<Map<string, AgentResult>> {
    // Reset state for each run to prevent leaks across invocations
    this.results = new Map();
    this.running = 0;

    const pending = new Set(tasks.map((t) => t.id));
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    while (pending.size > 0) {
      // Find tasks whose dependencies are all resolved
      const ready = tasks.filter(
        (t) =>
          pending.has(t.id) &&
          t.dependsOn.every((dep) => this.results.has(dep)),
      );

      if (ready.length === 0 && pending.size > 0) {
        // Deadlock detection — deps can't be satisfied
        logger.error({ pending: Array.from(pending) }, 'Deadlock detected in task dependencies');
        for (const id of pending) {
          const task = taskMap.get(id);
          if (!task) continue;
          this.results.set(id, {
            taskId: id,
            role: task.role,
            status: 'cancelled',
            rawOutput: 'Cancelled due to dependency deadlock',
            findings: [],
            suggestions: [],
            meta: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0, retryCount: 0, provider: this.provider },
          });
        }
        break;
      }

      // Execute ready tasks up to concurrency limit
      const available = Math.max(0, this.maxConcurrent - this.running);
      if (available === 0) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const batch = ready.slice(0, available);
      const promises = batch.map(async (task) => {
        this.running++;
        pending.delete(task.id);
        this.emitEvent({ type: 'task:started', taskId: task.id, role: task.role });

        try {
          const result = await this.executeWithTimeout(task);
          this.results.set(task.id, result);

          if (result.status === 'completed') {
            this.emitEvent({ type: 'task:completed', taskId: task.id, result });
          } else {
            this.emitEvent({ type: 'task:failed', taskId: task.id, error: result.rawOutput });
          }
        } finally {
          this.running--;
        }
      });

      await Promise.all(promises);
    }

    return this.results;
  }

  /** Get results collected so far */
  getResults(): Map<string, AgentResult> {
    return new Map(this.results);
  }

  /** Execute a single additional task (used by orchestrator for dynamic spawning) */
  async executeOne(task: AgentTask): Promise<AgentResult> {
    this.running++;
    this.emitEvent({ type: 'task:spawned', task, reason: 'Dynamic spawn by orchestrator' });
    this.emitEvent({ type: 'task:started', taskId: task.id, role: task.role });

    try {
      const result = await this.executeWithTimeout(task);
      this.results.set(task.id, result);

      if (result.status === 'completed') {
        this.emitEvent({ type: 'task:completed', taskId: task.id, result });
      } else {
        this.emitEvent({ type: 'task:failed', taskId: task.id, error: result.rawOutput });
      }

      return result;
    } finally {
      this.running--;
    }
  }

  private async executeWithTimeout(task: AgentTask): Promise<AgentResult> {
    const timeout = task.timeoutMs || DEFAULT_TIMEOUT;
    let timer: ReturnType<typeof setTimeout>;

    return Promise.race([
      executeTask(task, this.provider),
      new Promise<AgentResult>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Task ${task.id} timed out after ${timeout}ms`)), timeout);
      }),
    ]).then(
      (result) => { clearTimeout(timer!); return result; },
      (error) => {
        clearTimeout(timer!);
        return {
          taskId: task.id,
          role: task.role,
          status: 'failed' as const,
          rawOutput: error instanceof Error ? error.message : String(error),
          findings: [],
          suggestions: [],
          meta: { startedAt: Date.now(), completedAt: Date.now(), durationMs: 0, retryCount: 0, provider: this.provider },
        };
      },
    );
  }
}
