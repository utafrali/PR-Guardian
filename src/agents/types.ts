import type { Severity } from '../config.js';

/** Agent roles in the system */
export type AgentRole = 'orchestrator' | 'reviewer' | 'tester' | 'developer';

/** Current lifecycle state of an agent */
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Task priority */
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

/** A task assigned to a sub-agent */
export interface AgentTask {
  id: string;
  role: AgentRole;
  priority: TaskPriority;
  description: string;
  /** Prompt sent to Claude Code CLI / API */
  prompt: string;
  /** Context data the agent needs */
  context: Record<string, unknown>;
  /** IDs of tasks that must complete before this one starts */
  dependsOn: string[];
  /** Maximum execution time in ms */
  timeoutMs: number;
}

/** Result produced by a sub-agent */
export interface AgentResult {
  taskId: string;
  role: AgentRole;
  status: AgentStatus;
  /** Raw output from the LLM */
  rawOutput: string;
  /** Structured findings */
  findings: AgentFinding[];
  /** Suggestions for other agents */
  suggestions: AgentSuggestion[];
  /** Execution metadata */
  meta: AgentMeta;
}

/** A single finding from an agent */
export interface AgentFinding {
  type: 'bug' | 'security' | 'performance' | 'style' | 'test-gap' | 'improvement';
  severity: Severity;
  file?: string;
  line?: number;
  title: string;
  description: string;
  suggestedFix?: string;
}

/** Cross-agent suggestion */
export interface AgentSuggestion {
  targetRole: AgentRole;
  action: string;
  reason: string;
  context: Record<string, unknown>;
}

/** Execution metadata */
export interface AgentMeta {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  retryCount: number;
  provider: 'claude-code' | 'api';
}

/** Orchestrator's view of the entire review pipeline */
export interface ReviewPipeline {
  id: string;
  owner: string;
  repo: string;
  pullNumber: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tasks: AgentTask[];
  results: Map<string, AgentResult>;
  /** Tasks spawned dynamically by the orchestrator */
  dynamicTasks: AgentTask[];
  startedAt: number;
  completedAt?: number;
}

/** Event emitted during pipeline execution */
export type PipelineEvent =
  | { type: 'task:started'; taskId: string; role: AgentRole }
  | { type: 'task:completed'; taskId: string; result: AgentResult }
  | { type: 'task:failed'; taskId: string; error: string }
  | { type: 'task:spawned'; task: AgentTask; reason: string }
  | { type: 'validation:started'; taskId: string }
  | { type: 'validation:result'; taskId: string; valid: boolean; issues: string[] }
  | { type: 'pipeline:completed'; summary: PipelineSummary };

/** Final summary of a completed pipeline */
export interface PipelineSummary {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalFindings: number;
  criticalFindings: number;
  crossValidated: boolean;
  overallStatus: 'pass' | 'fail' | 'warn';
}
