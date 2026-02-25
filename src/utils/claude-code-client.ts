import { execFile } from 'node:child_process';
import { logger } from './logger.js';
import type { AIReviewRequest, AIReviewResponse } from './ai-client.js';

// SECURITY: Validate allowed models to prevent CLI flag injection via config
const ALLOWED_MODELS = new Set([
  'claude-sonnet',
  'claude-haiku',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
]);

function getClaudeCommand(): string {
  const cmd = process.env.CLAUDE_CODE_PATH || 'claude';
  // Validate: reject paths with suspicious patterns
  if (cmd.includes('..') || cmd.includes('~')) {
    logger.warn({ cmd }, 'Suspicious CLAUDE_CODE_PATH, falling back to default');
    return 'claude';
  }
  return cmd;
}

function execClaude(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      getClaudeCommand(),
      args,
      {
        maxBuffer: 1024 * 1024 * 2, // 2MB — sufficient for reviews
        timeout: 120_000, // 2 min
        // SECURITY: Only pass required env vars to subprocess
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: process.env.NODE_ENV,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          // Distinguish timeout from other failures
          if ('killed' in error && error.killed) {
            logger.error('Claude Code CLI timed out after 120 seconds');
            reject(new Error('Claude Code CLI timed out — the PR may be too large'));
            return;
          }
          logger.error({ error, stderr }, 'Claude Code CLI failed');
          reject(new Error(`Claude Code CLI failed: ${error.message}`));
          return;
        }
        if (stderr && !error) {
          logger.debug({ stderr }, 'Claude Code CLI stderr output');
        }
        resolve(stdout);
      },
    );

    if (proc.stdin) {
      proc.stdin.on('error', (err) => {
        logger.error({ error: err }, 'Failed to write to Claude CLI stdin');
      });
      proc.stdin.write(input);
      proc.stdin.end();
    } else {
      reject(new Error('Claude Code CLI process has no stdin'));
    }
  });
}

export async function createReviewViaCLI(request: AIReviewRequest): Promise<AIReviewResponse> {
  const prompt = [
    request.systemPrompt,
    '',
    '---',
    '',
    request.userPrompt,
  ].join('\n');

  logger.info('Sending review request via Claude Code CLI');

  const args = [
    '--print',         // non-interactive, print output and exit
    '--output-format', 'text',
    '--max-turns', '1',
  ];

  // SECURITY: Validate model against allowlist before passing as CLI flag
  if (request.model && ALLOWED_MODELS.has(request.model)) {
    args.push('--model', request.model);
  } else if (request.model) {
    logger.warn({ model: request.model }, 'Unknown model, skipping --model flag');
  }

  const content = await execClaude(args, prompt);

  logger.info(
    { contentLength: content.length },
    'Received review response from Claude Code CLI',
  );

  return {
    content: content.trim(),
    model: request.model || 'claude-code-session',
    inputTokens: 0,  // CLI doesn't expose token counts
    outputTokens: 0,
  };
}
