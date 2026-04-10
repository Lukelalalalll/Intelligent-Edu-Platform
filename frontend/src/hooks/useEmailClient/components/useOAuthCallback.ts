import { useEffect } from 'react';

export function useOAuthCallbackEffect({
    code,
    state,
    setActiveProvider,
    setIsLoading,
    setError,
    setIsConnecting,
    gmailCallback,
    loadEmails,
    navigate,
    extractError,
}: {
    code: string | null;
    state: string | null;
    setActiveProvider: (value: string) => void;
    setIsLoading: (value: boolean) => void;
    setError: (value: string) => void;
    setIsConnecting: (value: boolean) => void;
    gmailCallback: (code: string, state?: string | null) => Promise<unknown>;
    loadEmails: () => Promise<void>;
    navigate: (to: string, options?: { replace?: boolean }) => void;
    extractError: (err: unknown, fallback: string) => string;
}) {
    useEffect(() => {
        if (!code) return;
        setActiveProvider('gmail');
        (async () => {
            setIsLoading(true);
            setError('');
            try {
                await gmailCallback(code, state);
                await loadEmails();
                navigate('/email-agent', { replace: true });
            } catch (err) {
                setError(extractError(err, 'Failed to complete Gmail OAuth callback.'));
            } finally {
                setIsLoading(false);
                setIsConnecting(false);
            }
        })();
    }, [code, state, setActiveProvider, setIsLoading, setError, setIsConnecting, gmailCallback, loadEmails, navigate, extractError]);
}
