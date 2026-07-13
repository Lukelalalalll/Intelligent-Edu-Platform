import { useState, useRef, useCallback, useEffect } from 'react';

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 300;

interface UseResizableSidebarOptions {
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    containerRef: React.RefObject<HTMLElement | null>;
}

interface UseResizableSidebarReturn {
    sidebarWidth: number;
    isDragging: boolean;
    handleMouseDown: (e: React.MouseEvent) => void;
}

export function useResizableSidebar({
    minWidth = SIDEBAR_MIN_WIDTH,
    maxWidth = SIDEBAR_MAX_WIDTH,
    defaultWidth = SIDEBAR_DEFAULT_WIDTH,
    containerRef,
}: UseResizableSidebarOptions): UseResizableSidebarReturn {
    const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = useRef(false);
    // rAF batching: coalesce rapid mousemove events to one setState per frame
    const pendingWidthRef = useRef<number | null>(null);
    const rafIdRef = useRef<number | null>(null);

    // Cleanup on unmount: remove any dangling listeners if still dragging
    useEffect(() => {
        return () => {
            if (isDraggingRef.current) {
                document.removeEventListener('mousemove', handleMouseMoveRef.current);
                document.removeEventListener('mouseup', handleMouseUpRef.current);
                isDraggingRef.current = false;
            }
            if (rafIdRef.current != null) {
                cancelAnimationFrame(rafIdRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Store latest handler refs so the cleanup effect can reach them
    const handleMouseMoveRef = useRef<(ev: MouseEvent) => void>(() => {});
    const handleMouseUpRef = useRef<() => void>(() => {});

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            isDraggingRef.current = true;
            setIsDragging(true);

            const handleMouseMove = (ev: MouseEvent) => {
                if (!isDraggingRef.current || !containerRef.current) return;
                const rect = containerRef.current.getBoundingClientRect();
                const newWidth = ev.clientX - rect.left;
                if (newWidth >= minWidth && newWidth <= maxWidth) {
                    // Buffer the latest width; commit once per rAF frame.
                    pendingWidthRef.current = newWidth;
                    if (rafIdRef.current == null) {
                        rafIdRef.current = requestAnimationFrame(() => {
                            rafIdRef.current = null;
                            if (pendingWidthRef.current != null) {
                                setSidebarWidth(pendingWidthRef.current);
                                pendingWidthRef.current = null;
                            }
                        });
                    }
                }
            };

            const handleMouseUp = () => {
                // Cancel any in-flight RAF and flush the last pending width
                if (rafIdRef.current != null) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                }
                if (pendingWidthRef.current != null) {
                    setSidebarWidth(pendingWidthRef.current);
                    pendingWidthRef.current = null;
                }
                isDraggingRef.current = false;
                setIsDragging(false);
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            handleMouseMoveRef.current = handleMouseMove;
            handleMouseUpRef.current = handleMouseUp;

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        },
        [containerRef, minWidth, maxWidth],
    );

    return { sidebarWidth, isDragging, handleMouseDown };
}
