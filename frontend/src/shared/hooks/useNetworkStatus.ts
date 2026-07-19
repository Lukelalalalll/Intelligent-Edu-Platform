/**
 * useNetworkStatus
 * ----------------
 * Provides a global offline/online flag driven by:
 *   1. browser `online`/`offline` events (fast, but may be stale on mobile)
 *   2. axios network-error notifications via `networkBus` (authoritative)
 *
 * Usage:
 *   const { isOffline } = useNetworkStatus();
 *
 * Axios integration (client.ts):
 *   import { networkBus } from './useNetworkStatus';
 *   networkBus.reportNetworkError();   // call on ERR_NETWORK
 *   networkBus.reportOnline();         // call on any 2xx after error
 */
import { useState, useEffect } from 'react';

// ── Singleton event bus ──────────────────────────────────────────────────────

type Listener = (offline: boolean) => void;
const hasBrowserNetworkApis = typeof window !== 'undefined' && typeof navigator !== 'undefined';
const listeners = new Set<Listener>();
let _isOffline = hasBrowserNetworkApis ? !navigator.onLine : false;

function notifyAll(offline: boolean) {
    _isOffline = offline;
    listeners.forEach((fn) => fn(offline));
}

export const networkBus = {
    /** Called by axios interceptor when a network error is detected. */
    reportNetworkError() {
        if (!_isOffline) notifyAll(true);
    },
    /** Called by axios interceptor when a successful response arrives. */
    reportOnline() {
        if (_isOffline) notifyAll(false);
    },
    /** Subscribe to state changes. Returns unsubscribe fn. */
    subscribe(fn: Listener): () => void {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },
    get isOffline() {
        return _isOffline;
    },
};

// Keep in sync with browser events as well
if (hasBrowserNetworkApis) {
    window.addEventListener('online', () => notifyAll(false));
    window.addEventListener('offline', () => notifyAll(true));
}

// ── React hook ───────────────────────────────────────────────────────────────

export function useNetworkStatus() {
    const [isOffline, setIsOffline] = useState<boolean>(_isOffline);

    useEffect(() => {
        setIsOffline(_isOffline); // sync on mount in case bus flipped before component mounts
        return networkBus.subscribe(setIsOffline);
    }, []);

    return { isOffline };
}
