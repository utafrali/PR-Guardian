import Anthropic from '@anthropic-ai/sdk';
import { createReviewViaCLI } from './claude-code-client.js';
import { logger } from './logger.js';

export type Provider = 'claude-code' | 'api';

const MODEL_MAP: Record<string, string> = {
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku': 'claude-haiku-4-5-20251001',
};

let client: Anthropic | null = null;
let currentApiKey: string | undefined;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  // Recreate client if key changed (supports rotation)
  if (!client || currentApiKey !== apiKey) {
    client = new Anthropic({ apiKey });
    currentApiKey = apiKey;
  }
  return client;
}

export function resolveModel(model: string): string {
  return MODEL_MAP[model] || model;
}

export interface AIReviewRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface AIReviewResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Direct Anthropic API call */
async function createReviewViaAPI(request: AIReviewRequest): Promise<AIReviewResponse> {
  const anthropic = getClient();
  const modelId = resolveModel(request.model);

  logger.info({ model: modelId }, 'Sending review request to Claude API');

  try {
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: request.maxTokens ?? 8192,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });

    const textContent = response.content.find((block) => block.type === 'text');
    const content = textContent ? textContent.text : '';

    if (!content) {
      logger.warn({ model: modelId }, 'Anthropic API returned empty text content');
    }

    logger.info(
      {
        model: modelId,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      'Received review response from Claude API',
    );

    return {
      content,
      model: modelId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      logger.error('Invalid ANTHROPIC_API_KEY');
      throw new Error('AI review failed: invalid API key');
    }
    if (error instanceof Anthropic.RateLimitError) {
      logger.warn('Rate limited by Anthropic API');
      throw new Error('AI review failed: rate limited — try again later');
    }
    throw error;
  }
}

/**
 * Create a review using the specified provider.
 * - `claude-code` (default): Uses Claude Code CLI session — no API key needed
 * - `api`: Uses Anthropic Messages API directly — requires ANTHROPIC_API_KEY
 */
export async function createReview(
  request: AIReviewRequest,
  provider: Provider = 'claude-code',
): Promise<AIReviewResponse> {
  if (provider === 'api') {
    return createReviewViaAPI(request);
  }
  return createReviewViaCLI(request);
}

/** Reset API client — useful for testing */
export function resetClient(): void {
  client = null;
  currentApiKey = undefined;
}
