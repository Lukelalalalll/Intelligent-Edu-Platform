interface Window {
    __apiKeyEditPwd?: string;
    MathJax?: {
        typesetPromise: () => Promise<void>;
        [key: string]: unknown;
    };
}
