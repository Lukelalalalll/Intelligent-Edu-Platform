/**
 * useStreamingOptimizer – batches rapid SSE delta updates using rAF + debounce
 * to prevent excessive React re-renders during AI streaming output.
 *
 * Works alongside usePretextMeasure for reflow-free layout.
 */
import { useCallback, useRef, useEffect } from 'react';

/**
 * Returns a `pushDelta` function that accumulates text deltas while coalescing
 * React state updates to at most once per animation frame (≈16ms) plus an
 * outer debounce guard (default 50ms).
 *
 * @param {(fullText: string) => void} onUpdate – called with the full accumulated text
 * @param {{ debounceMs?: number }} opts
 */
export function useStreamingOptimizer(onUpdate, opts = {}) {
  const { debounceMs = 50 } = opts;

  const textRef = useRef('');
  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const flush = useCallback(() => {
    rafRef.current = null;
    timerRef.current = null;
    onUpdateRef.current?.(textRef.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    // Already scheduled? Skip.
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      // Debounce the actual state update
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, debounceMs);
    });
  }, [flush, debounceMs]);

  /** Append a delta chunk. State update happens asynchronously (batched). */
  const pushDelta = useCallback(
    (deltaText) => {
      textRef.current += deltaText;
      scheduleFlush();
    },
    [scheduleFlush],
  );

  /** Reset accumulated text (call at stream start). */
  const reset = useCallback(() => {
    textRef.current = '';
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Force-flush any pending text and return the full text. */
  const finalize = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onUpdateRef.current?.(textRef.current);
    return textRef.current;
  }, []);

  /** Read current accumulated text without flushing. */
  const getText = useCallback(() => textRef.current, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  return { pushDelta, reset, finalize, getText };
}

export default useStreamingOptimizer;
