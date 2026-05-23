import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePollingOptions {
  interval: number;
  maxRetries?: number;
  stopOnSuccess?: boolean;
}

interface UsePollingResult {
  isPolling: boolean;
  attempts: number;
  start: () => void;
  stop: () => void;
}

export function usePolling(
  callback: () => Promise<boolean | void>,
  options: UsePollingOptions,
): UsePollingResult {
  const { interval, maxRetries = 120, stopOnSuccess = true } = options;
  const [isPolling, setIsPolling] = useState(false);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    setIsPolling(false);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stoppedRef.current = false;
    attemptsRef.current = 0;
    setIsPolling(true);
  }, []);

  useEffect(() => {
    if (!isPolling) return;

    let alive = true;

    const poll = async () => {
      if (stoppedRef.current || !alive) return;

      if (attemptsRef.current >= maxRetries) {
        if (alive) setIsPolling(false);
        return;
      }

      try {
        const shouldStop = await callback();
        if (!alive || stoppedRef.current) return;

        attemptsRef.current += 1;

        if (stopOnSuccess && shouldStop) {
          if (alive) setIsPolling(false);
          return;
        }
      } catch {
        attemptsRef.current += 1;
      }

      if (!alive || stoppedRef.current) return;

      timerRef.current = setTimeout(poll, interval);
    };

    // Fire the first poll immediately, then schedule subsequent polls
    poll();

    return () => {
      alive = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPolling, callback, interval, maxRetries, stopOnSuccess]);

  return { isPolling, attempts: attemptsRef.current, start, stop };
}
