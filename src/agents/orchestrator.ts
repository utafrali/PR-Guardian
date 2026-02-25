import { randomUUID } from 'node:crypto';
import type { ReviewContext, ReviewResult, ReviewComment } from '../config.js';
import type { PRDiff } from '../github/diff.js';
import type {
  AgentResult,
  AgentFinding,
  PipelineEvent,
  PipelineSummary,
  ReviewPipeline,
} from './types.js';
import { AgentPool } from './agent-pool.js';
import { createReviewerTasks } from './reviewer-agent.js';
import { createTesterTask } from './tester-agent.js';
import { createDeveloperTask } from './developer-agent.js';
import { logger } from '../utils/logger.js';

export interface OrchestratorConfig {
  /** Max agents running in parallel */
  maxConcurrent: number;
  /** Spawn developer agent after reviewer + tester? */
  enableDeveloperAgent: boolean;
  /** Cross-validate findings between agents? */
  crossValidate: boolean;
}

const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxConcurrent: 3,
  enableDeveloperAgent: true,
  crossValidate: true,
};

/**
 * Master Orchestrator — coordinates all sub-agents for a PR review.
 *
 * Flow:
 * 1. Analyze PR diff and determine which agents to spawn
 * 2. Run reviewer(s) and tester in parallel (Phase 1)
 * 3. Collect Phase 1 results, decide if developer agent is needed (Phase 2)
 * 4. Optionally spawn more agents based on cross-agent suggestions
 * 5. Cross-validate findings between agents
 * 6. Aggregate everything into final ReviewResult
 */
export class Orchestrator {
  private config: OrchestratorConfig;
  private events: PipelineEvent[] = [];
  private pipeline: ReviewPipeline | null = null;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
  }

  /** Run the full orchestrated review pipeline */
  async review(
    reviewContext: ReviewContext,
    diff: PRDiff,
  ): Promise<ReviewResult> {
    const startedAt = Date.now();

    // Reset state to prevent memory leaks across multiple runs
    this.events = [];

    this.pipeline = {
      id: randomUUID(),
      owner: reviewContext.owner,
      repo: reviewContext.repo,
      pullNumber: reviewContext.pullNumber,
      status: 'running',
      tasks: [],
      results: new Map(),
      dynamicTasks: [],
      startedAt,
    };

    const pool = new AgentPool({
      provider: reviewContext.config.review.provider,
      maxConcurrent: this.config.maxConcurrent,
      onEvent: (event) => {
        this.events.push(event);
        this.logEvent(event);
      },
    });

    logger.info(
      { pipelineId: this.pipeline.id, pullNumber: reviewContext.pullNumber },
      'Orchestrator starting review pipeline',
    );

    // ── Phase 1: Parallel — Reviewer(s) + Tester ──
    const reviewerTasks = createReviewerTasks(pool, reviewContext, diff);
    const testerTask = createTesterTask(pool, reviewContext, diff);
    const phase1Tasks = [...reviewerTasks, testerTask];

    this.pipeline.tasks.push(...phase1Tasks);

    logger.info(
      { reviewerCount: reviewerTasks.length, phase: 1 },
      'Phase 1: Running reviewer and tester agents in parallel',
    );

    const phase1Results = await pool.executeTasks(phase1Tasks);

    // ── Analyze Phase 1 ──
    const reviewerFindings = this.collectFindings(phase1Results, 'reviewer');
    const testerFindings = this.collectFindings(phase1Results, 'tester');
    const allSuggestions = this.collectSuggestions(phase1Results);

    logger.info(
      { reviewerFindings: reviewerFindings.length, testerFindings: testerFindings.length, suggestions: allSuggestions.length },
      'Phase 1 complete',
    );

    // ── Phase 2: Developer agent (if needed) ──
    let developerFindings: AgentFinding[] = [];

    const totalFindings = reviewerFindings.length + testerFindings.length;
    const shouldSpawnDeveloper =
      this.config.enableDeveloperAgent && totalFindings > 0;

    if (shouldSpawnDeveloper) {
      logger.info({ phase: 2 }, 'Phase 2: Spawning developer agent for improvement suggestions');

      const developerTask = createDeveloperTask(
        pool,
        reviewContext,
        diff,
        reviewerFindings,
        testerFindings,
        [], // no deps since Phase 1 is already done
      );

      this.pipeline.dynamicTasks.push(developerTask);
      const devResult = await pool.executeOne(developerTask);
      developerFindings = devResult.findings;

      logger.info({ developerFindings: developerFindings.length }, 'Phase 2 complete');
    }

    // ── Phase 3: Cross-validation ──
    let crossValidated = false;
    if (this.config.crossValidate && totalFindings > 0) {
      crossValidated = true;
      this.crossValidateFindings(reviewerFindings, testerFindings, developerFindings);
    }

    // ── Phase 4: Dynamic spawning based on suggestions ──
    const dynamicResults = await this.processSuggestions(pool, reviewContext, diff, allSuggestions);

    // ── Aggregate ──
    const allFindings = [
      ...reviewerFindings,
      ...testerFindings,
      ...developerFindings,
      ...dynamicResults,
    ];

    const summary = this.buildSummary(allFindings, phase1Results, crossValidated);
    this.pipeline.status = 'completed';
    this.pipeline.completedAt = Date.now();

    this.events.push({ type: 'pipeline:completed', summary });
    logger.info(
      { pipelineId: this.pipeline.id, durationMs: Date.now() - startedAt, ...summary },
      'Orchestrator pipeline complete',
    );

    return this.toReviewResult(allFindings, summary, reviewContext);
  }

  /** Get all pipeline events (useful for debugging/monitoring) */
  getEvents(): PipelineEvent[] {
    return [...this.events];
  }

  /** Get the pipeline state */
  getPipeline(): ReviewPipeline | null {
    return this.pipeline;
  }

  // ── Private helpers ──

  private collectFindings(results: Map<string, AgentResult>, role: string): AgentFinding[] {
    const findings: AgentFinding[] = [];
    for (const result of results.values()) {
      if (result.role === role && result.status === 'completed') {
        findings.push(...result.findings);
      }
    }
    return findings;
  }

  private collectSuggestions(results: Map<string, AgentResult>) {
    const suggestions = [];
    for (const result of results.values()) {
      if (result.status === 'completed') {
        suggestions.push(...result.suggestions);
      }
    }
    return suggestions;
  }

  /**
   * Cross-validate: check if reviewer and tester found overlapping issues.
   * Log agreement/disagreement for quality signal.
   */
  private crossValidateFindings(
    reviewerFindings: AgentFinding[],
    testerFindings: AgentFinding[],
    developerFindings: AgentFinding[],
  ): void {
    // Check for file overlap — same file flagged by multiple agents
    const reviewerFiles = new Set(reviewerFindings.map((f) => f.file).filter(Boolean));
    const testerFiles = new Set(testerFindings.map((f) => f.file).filter(Boolean));
    const developerFiles = new Set(developerFindings.map((f) => f.file).filter(Boolean));

    const agreedFiles = [...reviewerFiles].filter(
      (f) => testerFiles.has(f) || developerFiles.has(f),
    );

    if (agreedFiles.length > 0) {
      logger.info(
        { agreedFiles, count: agreedFiles.length },
        'Cross-validation: multiple agents flagged the same files — higher confidence',
      );
    }

    // Boost severity for findings confirmed by multiple agents
    for (const finding of reviewerFindings) {
      if (finding.file && (testerFiles.has(finding.file) || developerFiles.has(finding.file))) {
        if (finding.severity === 'nit') {
          finding.severity = 'warning';
        }
      }
    }
  }

  /**
   * Process cross-agent suggestions.
   * If an agent suggests work for another agent, the orchestrator may spawn it.
   */
  private async processSuggestions(
    pool: AgentPool,
    context: ReviewContext,
    diff: PRDiff,
    suggestions: Array<{ targetRole: string; action: string; reason: string; context: Record<string, unknown> }>,
  ): Promise<AgentFinding[]> {
    const findings: AgentFinding[] = [];

    // Only spawn additional agents for high-value suggestions
    const highValueSuggestions = suggestions.filter((s) =>
      s.reason.toLowerCase().includes('critical') ||
      s.reason.toLowerCase().includes('security') ||
      s.reason.toLowerCase().includes('bug'),
    );

    // Cap at 2 additional dynamic agents to prevent runaway costs
    const toSpawn = highValueSuggestions.slice(0, 2);

    for (const suggestion of toSpawn) {
      const role = suggestion.targetRole as 'reviewer' | 'tester' | 'developer';
      if (!['reviewer', 'tester', 'developer'].includes(role)) continue;

      logger.info(
        { targetRole: role, action: suggestion.action },
        'Orchestrator spawning dynamic agent from suggestion',
      );

      const task = pool.createTask({
        role,
        priority: 'high',
        description: `Dynamic: ${suggestion.action}`,
        prompt: [
          `## Dynamic Task from Orchestrator`,
          `**Reason:** ${suggestion.reason}`,
          `**Action:** ${suggestion.action}`,
          '',
          `## Context`,
          JSON.stringify(suggestion.context, null, 2),
          '',
          `## PR Diff`,
          diff.files.map((f) => `${f.filename} (+${f.additions} -${f.deletions})`).join('\n'),
        ].join('\n'),
        context: { model: context.config.review.model },
        dependsOn: [],
        timeoutMs: 90_000,
      });

      this.pipeline?.dynamicTasks.push(task);
      const result = await pool.executeOne(task);
      findings.push(...result.findings);
    }

    return findings;
  }

  private buildSummary(
    findings: AgentFinding[],
    results: Map<string, AgentResult>,
    crossValidated: boolean,
  ): PipelineSummary {
    // results already contains dynamic tasks (added via executeOne), so just use results.size
    const totalTasks = results.size;
    let completedTasks = 0;
    let failedTasks = 0;

    for (const r of results.values()) {
      if (r.status === 'completed') completedTasks++;
      if (r.status === 'failed') failedTasks++;
    }

    const criticalFindings = findings.filter((f) => f.severity === 'critical').length;

    return {
      totalTasks,
      completedTasks,
      failedTasks,
      totalFindings: findings.length,
      criticalFindings,
      crossValidated,
      overallStatus: criticalFindings > 0 ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
    };
  }

  private toReviewResult(
    findings: AgentFinding[],
    summary: PipelineSummary,
    context: ReviewContext,
  ): ReviewResult {
    const severityOrder = { critical: 0, warning: 1, nit: 2 };
    const threshold = severityOrder[context.config.review.severity_threshold];

    const filteredFindings = findings.filter(
      (f) => severityOrder[f.severity] <= threshold,
    );

    const comments: ReviewComment[] = filteredFindings
      .filter((f) => f.file && f.line)
      .map((f) => ({
        path: f.file!,
        line: f.line!,
        body: `**[${f.severity.toUpperCase()}]** ${f.title}\n\n${f.description}${f.suggestedFix ? `\n\n**Suggested fix:**\n\`\`\`\n${f.suggestedFix}\n\`\`\`` : ''}`,
        severity: f.severity,
      }));

    const statusIcon = summary.overallStatus === 'pass' ? ':white_check_mark:' : summary.overallStatus === 'fail' ? ':x:' : ':warning:';
    const summaryText = [
      `${statusIcon} **PR Guardian Multi-Agent Review**`,
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Agents deployed | ${summary.totalTasks} |`,
      `| Findings | ${summary.totalFindings} |`,
      `| Critical | ${summary.criticalFindings} |`,
      `| Cross-validated | ${summary.crossValidated ? 'Yes' : 'No'} |`,
      '',
      ...this.buildFindingsSummary(filteredFindings),
    ].join('\n');

    return {
      reviewer: 'AI Review',
      summary: summaryText,
      comments,
      status: summary.overallStatus === 'fail' ? 'failure' : summary.overallStatus === 'warn' ? 'neutral' : 'success',
    };
  }

  private buildFindingsSummary(findings: AgentFinding[]): string[] {
    if (findings.length === 0) return ['No issues found. Code looks good!'];

    const grouped = new Map<string, AgentFinding[]>();
    for (const f of findings) {
      const key = f.type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(f);
    }

    const lines: string[] = ['### Findings by Category', ''];
    for (const [type, items] of grouped) {
      lines.push(`**${type}** (${items.length})`);
      for (const item of items.slice(0, 5)) { // cap at 5 per category for summary
        lines.push(`- [${item.severity}] ${item.file || 'general'}: ${item.title}`);
      }
      if (items.length > 5) {
        lines.push(`- ... and ${items.length - 5} more`);
      }
      lines.push('');
    }

    return lines;
  }

  private logEvent(event: PipelineEvent): void {
    switch (event.type) {
      case 'task:started':
        logger.info({ taskId: event.taskId, role: event.role }, 'Agent started');
        break;
      case 'task:completed':
        logger.info(
          { taskId: event.taskId, findings: event.result.findings.length, durationMs: event.result.meta.durationMs },
          'Agent completed',
        );
        break;
      case 'task:failed':
        logger.error({ taskId: event.taskId, error: event.error }, 'Agent failed');
        break;
      case 'task:spawned':
        logger.info({ taskId: event.task.id, role: event.task.role, reason: event.reason }, 'Dynamic agent spawned');
        break;
      case 'pipeline:completed':
        logger.info({ summary: event.summary }, 'Pipeline completed');
        break;
    }
  }
}
