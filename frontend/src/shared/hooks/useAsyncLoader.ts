import { useCallback, useRef, useState } from 'react';

interface LoadableState<T> {
    data: T;
    loading: boolean;
    error: string;
}

interface UseAsyncLoaderOptions<T> {
    initialData: T;
    load: () => Promise<T>;
    onSuccess?: (data: T) => void;
    onError?: (error: unknown) => void;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return 'Request failed';
}

export function useAsyncLoader<T>({
    initialData,
    load,
    onSuccess,
    onError,
}: UseAsyncLoaderOptions<T>) {
    const [state, setState] = useState<LoadableState<T>>({
        data: initialData,
        loading: false,
        error: '',
    });
    const requestIdRef = useRef(0);

    const run = useCallback(async () => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setState((prev) => ({ ...prev, loading: true, error: '' }));
        try {
            const data = await load();
            if (requestId !== requestIdRef.current) {
                return data;
            }
            setState({ data, loading: false, error: '' });
            onSuccess?.(data);
            return data;
        } catch (error) {
            const message = getErrorMessage(error);
            if (requestId !== requestIdRef.current) {
                return undefined;
            }
            setState((prev) => ({ ...prev, loading: false, error: message }));
            onError?.(error);
            return undefined;
        }
    }, [load, onError, onSuccess]);

    return {
        ...state,
        reload: run,
        setData: (updater: T | ((prev: T) => T)) => {
            setState((prev) => ({
                ...prev,
                data: typeof updater === 'function'
                    ? (updater as (prev: T) => T)(prev.data)
                    : updater,
            }));
        },
        clearError: () => setState((prev) => ({ ...prev, error: '' })),
    };
}
