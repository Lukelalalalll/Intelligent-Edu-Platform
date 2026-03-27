const LOG_LEVEL_PRIORITY = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const DEFAULT_LEVEL = 'info';
const currentLevel = (import.meta.env.VITE_LOG_LEVEL || DEFAULT_LEVEL).toLowerCase();

const shouldLog = (level) => {
    const target = LOG_LEVEL_PRIORITY[level] || LOG_LEVEL_PRIORITY.info;
    const active = LOG_LEVEL_PRIORITY[currentLevel] || LOG_LEVEL_PRIORITY.info;
    return target >= active;
};

const emit = (level, scope, message, meta) => {
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
    debug: (scope, message, meta) => emit('debug', scope, message, meta),
    info: (scope, message, meta) => emit('info', scope, message, meta),
    warn: (scope, message, meta) => emit('warn', scope, message, meta),
    error: (scope, message, meta) => emit('error', scope, message, meta),
};
