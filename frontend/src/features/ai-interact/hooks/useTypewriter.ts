import { useState, useEffect, useRef } from 'react';

/**
 * Progressively reveals `target` text frame-by-frame (typewriter effect).
 * When `isActive` is false (streaming ended or not the active message),
 * snaps immediately to the full target string.
 *
 * @param target       Full accumulated text to reveal (grows as chunks arrive)
 * @param isActive     True while this message is being streamed
 * @param charsPerFrame Characters to reveal per animation frame (~60fps)
 */
export function useTypewriter(
    target: string,
    isActive: boolean,
    charsPerFrame = 8,
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

    // Start / resume animation whenever target grows and animation isn't running
    useEffect(() => {
        if (!isActive || rafRef.current != null) return;
        if (posRef.current >= target.length) return;

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
                posRef.current = Math.min(posRef.current + charsPerFrame, t.length);
                setDisplayed(t.slice(0, posRef.current));
                rafRef.current = requestAnimationFrame(step);
            } else {
                // Caught up with current content; wait for next chunk
                rafRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(step);
    }, [target, isActive, charsPerFrame]);

    // Cancel RAF on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current != null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return displayed;
}
