// Feature-root shared types for the slides feature.
// PptTemplate-local types remain in pages/PptTemplate/types.ts.

export type SlidesSection = {
    title: string;
    content: string;
};

export type SlidesTaskEvent = {
    type: string;
    step: string;
    message: string;
    ts: number;
};

export type SlidesProvider = 'coze' | 'local_ollama' | 'deepseek';