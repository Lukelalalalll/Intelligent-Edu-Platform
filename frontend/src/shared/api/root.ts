export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

const hasWindow = typeof window !== 'undefined';

export const resolveApiRoot = (): string => {
  const configured = String(import.meta.env.VITE_API_ROOT || '').trim();
  const raw = configured || (hasWindow ? window.location.origin : '');

  if (raw === '/') {
    return hasWindow ? window.location.origin : '';
  }

  try {
    const parsed = new URL(raw, hasWindow ? window.location.origin : undefined);
    const browserHost = hasWindow ? window.location.hostname : '';

    if (
      hasWindow &&
      LOOPBACK_HOSTS.has(parsed.hostname) &&
      LOOPBACK_HOSTS.has(browserHost) &&
      parsed.hostname !== browserHost
    ) {
      parsed.hostname = browserHost;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
};

export const resolveWsRoot = (): string => {
  const root = resolveApiRoot() || (hasWindow ? window.location.origin : '');
  return root.replace(/^http/i, 'ws');
};
