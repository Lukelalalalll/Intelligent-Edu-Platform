/**
 * Unified logger — the single logging interface for the entire frontend.
 *
 * Usage:
 *   import { log } from '@/shared/utils/logger';
 *   log.info('module', 'message', { meta: 'data' });
 *   log.error('module', 'Something went wrong', new Error('...'));
 *
 * In production, set LOG_LEVEL=error or LOG_LEVEL=silent via env.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  meta?: unknown;
}

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getConfiguredLevel(): LogLevel {
  try {
    // Vite exposes import.meta.env in dev/build
    const viteEnv = (import.meta as unknown as { env?: { VITE_LOG_LEVEL?: string; PROD?: boolean } }).env;
    if (viteEnv?.VITE_LOG_LEVEL && viteEnv.VITE_LOG_LEVEL in LOG_LEVEL_MAP) {
      return viteEnv.VITE_LOG_LEVEL as LogLevel;
    }
    if (viteEnv?.PROD) return 'warn';
  } catch {
    // fallback for test environments
  }
  return 'debug';
}

const currentLevel = getConfiguredLevel();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_MAP[level] >= LOG_LEVEL_MAP[currentLevel];
}

function formatEntry(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}`;
}

function createLogEntry(level: LogLevel, module: string, message: string, meta?: unknown): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    meta,
  };
}

export const log = {
  debug(module: string, message: string, meta?: unknown) {
    if (!shouldLog('debug')) return;
    const entry = createLogEntry('debug', module, message, meta);
    console.debug(formatEntry(entry), meta ?? '');
  },

  info(module: string, message: string, meta?: unknown) {
    if (!shouldLog('info')) return;
    const entry = createLogEntry('info', module, message, meta);
    console.info(formatEntry(entry), meta ?? '');
  },

  warn(module: string, message: string, meta?: unknown) {
    if (!shouldLog('warn')) return;
    const entry = createLogEntry('warn', module, message, meta);
    console.warn(formatEntry(entry), meta ?? '');
  },

  error(module: string, message: string, meta?: unknown) {
    if (!shouldLog('error')) return;
    const entry = createLogEntry('error', module, message, meta);
    console.error(formatEntry(entry), meta ?? '');
  },
} as const;

// Prevents direct console.log usage — always go through `log`.
// (Add `"no-restricted-syntax": ["error", { "selector": "CallExpression[callee.object.name='console'][callee.property.name=/^(log|error|warn|info|debug)$/']", "message": "Use log.* from @/shared/utils/logger instead of console directly." }]` to ESLint config.)