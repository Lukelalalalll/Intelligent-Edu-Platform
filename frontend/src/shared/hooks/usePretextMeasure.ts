/**
 * usePretextMeasure – DOM-free text height measurement using @chenglou/pretext.
 *
 * Replaces getBoundingClientRect / scrollHeight probes with pure-arithmetic
 * layout(), eliminating layout reflow during streaming output.
 *
 * Usage:
 *   const { measureHeight, scrollToBottom } = usePretextMeasure(containerRef, {
 *     font: '16px Inter, system-ui, sans-serif',
 *     lineHeight: 25.6,   // 16px * 1.6
 *     debounceMs: 60,
 *   });
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { prepare, layout } from '@chenglou/pretext';

interface MeasureResult {
  height: number;
  lineCount: number;
}

interface PretextMeasureOpts {
  font?: string;
  lineHeight?: number;
  bubbleMaxWidthRatio?: number;
  bubblePadding?: number;
  debounceMs?: number;
}

// ── Shared LRU-ish cache (across all hook instances) ──────────────────────
const CACHE_MAX = 512;
const heightCache = new Map<string, MeasureResult>();

function cacheKey(text: string, font: string, maxWidth: number, lineHeight: number): string {
  return `${font}|${maxWidth}|${lineHeight}|${text.length > 120 ? text.slice(0, 120) : text}`;
}

function cachedMeasure(text: string, font: string, maxWidth: number, lineHeight: number): MeasureResult {
  const key = cacheKey(text, font, maxWidth, lineHeight);
  const hit = heightCache.get(key);
  if (hit) return hit;

  try {
    const prepared = prepare(text, font);
    const result = layout(prepared, maxWidth, lineHeight);
    if (heightCache.size >= CACHE_MAX) {
      // Evict oldest entry
      const first = heightCache.keys().next().value;
      heightCache.delete(first!);
    }
    heightCache.set(key, result);
    return result;
  } catch {
    // Fallback: estimate from line count heuristic
    const avgCharWidth = lineHeight * 0.5;
    const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidth));
    const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
    return { height: lines * lineHeight, lineCount: lines };
  }
}

// ── Debounce helper ───────────────────────────────────────────────────────
function useDebouncedCallback<T extends (...args: unknown[]) => void>(fn: T, delayMs: number): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFn = useRef(fn);
  latestFn.current = fn;

  const debounced = useCallback((...args: unknown[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      latestFn.current(...args);
    }, delayMs);
  }, [delayMs]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return debounced as T;
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function usePretextMeasure(containerRef: RefObject<HTMLElement | null>, opts: PretextMeasureOpts = {}) {
  const {
    font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight = 25.6,      // 16px * 1.6
    bubbleMaxWidthRatio = 0.85, // max-width of a bubble relative to container
    bubblePadding = 40,     // horizontal padding inside bubble (14+20 left+right ≈ 40)
  } = opts;

  const rafId = useRef<number | null>(null);
  const pendingScroll = useRef(false);

  // ── measureHeight: pure-arithmetic height for a piece of text ──────────
  const measureHeight = useCallback(
    (text: string, overrideMaxWidth?: number): MeasureResult => {
      if (!text) return { height: 0, lineCount: 0 };
      const containerWidth = containerRef?.current?.clientWidth;
      const maxW =
        overrideMaxWidth ??
        (containerWidth
          ? containerWidth * bubbleMaxWidthRatio - bubblePadding
          : 600);
      return cachedMeasure(text, font, maxW, lineHeight);
    },
    [font, lineHeight, bubbleMaxWidthRatio, bubblePadding, containerRef],
  );

  // ── scrollToBottom: rAF-batched for smooth streaming scroll ─────────
  const rawScroll = useCallback(() => {
    const el = containerRef?.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [containerRef]);

  const scrollToBottom = useCallback(
    (immediate = false): void => {
      if (immediate) {
        // Cancel any pending raf scroll and do it now
        if (rafId.current) {
          cancelAnimationFrame(rafId.current);
          rafId.current = null;
        }
        rawScroll();
        return;
      }
      // Batched via rAF only (~16ms) — fast enough for typewriter feel
      if (!pendingScroll.current) {
        pendingScroll.current = true;
        rafId.current = requestAnimationFrame(() => {
          pendingScroll.current = false;
          rafId.current = null;
          rawScroll();
        });
      }
    },
    [rawScroll],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return { measureHeight, scrollToBottom, cachedMeasure };
}

export { cachedMeasure };
export default usePretextMeasure;
