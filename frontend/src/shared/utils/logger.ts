type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const DEFAULT_LEVEL: LogLevel = 'info';
const currentLevel = ((import.meta.env.VITE_LOG_LEVEL || DEFAULT_LEVEL) as string).toLowerCase() as LogLevel;

const shouldLog = (level: LogLevel): boolean => {
    const target = LOG_LEVEL_PRIORITY[level] || LOG_LEVEL_PRIORITY.info;
    const active = LOG_LEVEL_PRIORITY[currentLevel] || LOG_LEVEL_PRIORITY.info;
    return target >= active;
};

const emit = (level: LogLevel, scope: string, message: string, meta?: unknown): void => {
    if (!shouldLog(level)) return;
    const now = new Date().toISOString();
    const prefix = `[${now}] [${level.toUpperCase()}] [${scope}] ${message}`;

    if (level === 'error') {
        console.error(prefix, meta || '');
        return;
    }
    if (level === 'warn') {
        console.warn(prefix, meta || '');
        return;
    }
    console.log(prefix, meta || '');
};

export const log = {
    debug: (scope: string, message: string, meta?: unknown): void => emit('debug', scope, message, meta),
    info: (scope: string, message: string, meta?: unknown): void => emit('info', scope, message, meta),
    warn: (scope: string, message: string, meta?: unknown): void => emit('warn', scope, message, meta),
    error: (scope: string, message: string, meta?: unknown): void => emit('error', scope, message, meta),
};
