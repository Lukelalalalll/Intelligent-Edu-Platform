import { useState, useCallback, useRef } from 'react';

/**
 * Lightweight toast notification hook.
 * Usage:
 *   const { toasts, showToast } = useToast();
 *   showToast('Upload succeeded', 'success');
 *   showToast('Something went wrong', 'error');
 *
 * Render <ToastContainer toasts={toasts} /> somewhere in your tree.
 */
let _nextId = 1;

export function useToast(autoHideMs = 4000) {
    const [toasts, setToasts] = useState([]);
    const timersRef = useRef({});

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
    }, []);

    const showToast = useCallback((message, type = 'info') => {
        const id = _nextId++;
        setToasts((prev) => [...prev.slice(-4), { id, message, type }]); // keep max 5
        timersRef.current[id] = setTimeout(() => removeToast(id), autoHideMs);
    }, [autoHideMs, removeToast]);

    return { toasts, showToast, removeToast };
}
