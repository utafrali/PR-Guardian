import pino from 'pino';

const VALID_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const envLevel = process.env.LOG_LEVEL;
const level = envLevel && (VALID_LEVELS as readonly string[]).includes(envLevel) ? envLevel : 'info';

export const logger = pino({
  name: 'pr-guardian',
  level,
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

export type Logger = typeof logger;
