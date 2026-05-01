import { useState, useEffect, useRef } from 'react';

/**
 * Progressively reveals `target` text frame-by-frame (typewriter effect).
 * Runs a **continuous** rAF loop while `isActive` is true so there is never
 * a stop-start gap between SSE chunks.  When `isActive` turns false
 * (streaming ended), continues the animation at accelerated speed until
 * caught up, then stops.
 *
 * @param target       Full accumulated text to reveal (grows as chunks arrive)
 * @param isActive     True while this message is being streamed
 * @param charsPerFrame Base characters to reveal per animation frame (~60fps).
 *                      Automatically speeds up when the buffer grows large.
 */
export function useTypewriter(
    target: string,
    isActive: boolean,
    charsPerFrame = 1,
): string {
    const [displayed, setDisplayed] = useState(() => (isActive ? '' : target));
    const posRef = useRef(isActive ? 0 : target.length);
    const rafRef = useRef<number | null>(null);
    // Always-current refs so RAF callbacks see latest values without stale closure
    const targetRef = useRef(target);
    const isActiveRef = useRef(isActive);
    targetRef.current = target;
    isActiveRef.current = isActive;

    // When isActive turns off, start a finish-up animation instead of snapping.
    // If already caught up, snap immediately.
    useEffect(() => {
        if (!isActive) {
            const t = targetRef.current;
            if (posRef.current >= t.length) {
                // Already caught up — just sync displayed
                setDisplayed(t);
                return;
            }
            // Cancel the streaming loop — we'll start a new finish-up loop
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            const finishStep = () => {
                const t = targetRef.current;
                if (posRef.current >= t.length) {
                    posRef.current = t.length;
                    setDisplayed(t);
                    rafRef.current = null;
                    return;
                }
                // Accelerated speed for finish-up: at least 5x base speed
                const behind = t.length - posRef.current;
                const speed = behind > 300 ? charsPerFrame * 16
                    : behind > 100 ? charsPerFrame * 8
                    : Math.max(charsPerFrame * 5, 12);
                posRef.current = Math.min(posRef.current + speed, t.length);
                setDisplayed(t.slice(0, posRef.current));
                rafRef.current = requestAnimationFrame(finishStep);
            };
            rafRef.current = requestAnimationFrame(finishStep);
        }
        return () => {
            // Only clean up if isActive is false (finish-up loop)
            if (!isActive && rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [isActive, charsPerFrame]);

    // Continuous animation loop — runs the entire time isActive is true.
    // Reads from targetRef (always fresh) so it doesn't need `target` as a dep.
    useEffect(() => {
        if (!isActive) return;

        const step = () => {
            // Stream ended mid-animation — let the isActive effect handle finish-up
            if (!isActiveRef.current) {
                rafRef.current = null;
                return;
            }

            const t = targetRef.current;
            if (posRef.current < t.length) {
                // Adaptive speed: accelerate when buffer grows large to prevent
                // falling too far behind a fast model, keep slow when buffer is
                // small so the typing cadence is visible.
                const behind = t.length - posRef.current;
                const speed = behind > 300 ? charsPerFrame * 8
                    : behind > 150 ? charsPerFrame * 4
                    : behind > 60  ? charsPerFrame * 2
                    : charsPerFrame;
                posRef.current = Math.min(posRef.current + speed, t.length);
                setDisplayed(t.slice(0, posRef.current));
            }
            // Keep the loop alive — don't stop when caught up; new tokens can
            // arrive at any moment and we want zero-gap reveal.
            rafRef.current = requestAnimationFrame(step);
        };

        rafRef.current = requestAnimationFrame(step);

        return () => {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [isActive, charsPerFrame]);

    return displayed;
}
