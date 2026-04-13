import { useState, useEffect, useRef } from 'react';

/**
 * Progressively reveals `target` text frame-by-frame (typewriter effect).
 * Runs a **continuous** rAF loop while `isActive` is true so there is never
 * a stop-start gap between SSE chunks.  When `isActive` turns false
 * (streaming ended), snaps immediately to the full target string.
 *
 * @param target       Full accumulated text to reveal (grows as chunks arrive)
 * @param isActive     True while this message is being streamed
 * @param charsPerFrame Base characters to reveal per animation frame (~60fps).
 *                      Automatically speeds up when the buffer grows large.
 */
export function useTypewriter(
    target: string,
    isActive: boolean,
    charsPerFrame = 3,
): string {
    const [displayed, setDisplayed] = useState(() => (isActive ? '' : target));
    const posRef = useRef(isActive ? 0 : target.length);
    const rafRef = useRef<number | null>(null);
    // Always-current refs so RAF callbacks see latest values without stale closure
    const targetRef = useRef(target);
    const isActiveRef = useRef(isActive);
    targetRef.current = target;
    isActiveRef.current = isActive;

    // When isActive turns off, cancel animation and snap to full content
    useEffect(() => {
        if (!isActive) {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            posRef.current = targetRef.current.length;
            setDisplayed(targetRef.current);
        }
    }, [isActive]);

    // Continuous animation loop — runs the entire time isActive is true.
    // Reads from targetRef (always fresh) so it doesn't need `target` as a dep.
    useEffect(() => {
        if (!isActive) return;

        const step = () => {
            // Snap immediately if streaming ended mid-animation
            if (!isActiveRef.current) {
                const t = targetRef.current;
                posRef.current = t.length;
                setDisplayed(t);
                rafRef.current = null;
                return;
            }

            const t = targetRef.current;
            if (posRef.current < t.length) {
                // Adaptive speed: accelerate when buffer grows large to prevent
                // falling too far behind a fast model, keep slow when buffer is
                // small so the typing cadence is visible.
                const behind = t.length - posRef.current;
                const speed = behind > 300 ? charsPerFrame * 5
                    : behind > 150 ? charsPerFrame * 3
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
