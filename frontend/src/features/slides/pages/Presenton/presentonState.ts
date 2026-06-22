import type {
    PresentonOutlineSlide,
    SlidesRuntimeProvider,
    SlidesGenerateV2TaskStatusResponse,
    SlidesThemeItem,
} from '../../api/slidesApi';
import type { MdProcessorHeaderState } from '../MdProcessor/hooks/mdProcessorWizardState';

export type PresentonSourceMeta = {
    kind: 'upload' | 'text';
    sourceFilename: string;
    sourceDisplayName: string;
    combinedFilename: string;
    presentationTitle: string;
    markdownContent: string;
    headerCount?: number;
};

export type PresentonSourceDraft = {
    source: PresentonSourceMeta;
    provider: SlidesRuntimeProvider;
    providerLabel?: string;
    providerModel?: string;
    aiSummary?: string;
    headers?: MdProcessorHeaderState[];
    selectedIndices?: number[];
    useLLM?: boolean;
    headerLlmProvider?: 'local_ollama' | 'coze' | 'deepseek';
};

export type PresentonOutlineDraft = {
    source: PresentonSourceMeta;
    provider: SlidesRuntimeProvider;
    providerResolved?: string;
    providerSource?: string;
    providerModel?: string;
    totalPages: number;
    slides: PresentonOutlineSlide[];
    selectedTheme?: string;
    selectedThemeMeta?: SlidesThemeItem | null;
};

export type PresentonWorkspaceDraft = {
    source: PresentonSourceMeta;
    provider: SlidesRuntimeProvider;
    taskId: string;
    status?: SlidesGenerateV2TaskStatusResponse['status'];
    currentStep?: string;
    progress?: number;
    error?: string;
    result?: NonNullable<SlidesGenerateV2TaskStatusResponse['result']> | null;
    outlineSlides: PresentonOutlineSlide[];
    selectedTheme?: string;
    selectedThemeMeta?: SlidesThemeItem | null;
};

const SOURCE_STORAGE_KEY = 'presenton_source_draft';
const OUTLINE_STORAGE_KEY = 'presenton_outline_draft';
const WORKSPACE_STORAGE_KEY = 'presenton_workspace_draft';

function readJson<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeJson<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function loadPresentonOutlineDraft(): PresentonOutlineDraft | null {
    return readJson<PresentonOutlineDraft>(OUTLINE_STORAGE_KEY);
}

export function loadPresentonSourceDraft(): PresentonSourceDraft | null {
    return readJson<PresentonSourceDraft>(SOURCE_STORAGE_KEY);
}

export function savePresentonSourceDraft(value: PresentonSourceDraft): void {
    writeJson(SOURCE_STORAGE_KEY, value);
}

export function clearPresentonSourceDraft(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(SOURCE_STORAGE_KEY);
}

export function savePresentonOutlineDraft(value: PresentonOutlineDraft): void {
    writeJson(OUTLINE_STORAGE_KEY, value);
}

export function clearPresentonOutlineDraft(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(OUTLINE_STORAGE_KEY);
}

export function loadPresentonWorkspaceDraft(): PresentonWorkspaceDraft | null {
    return readJson<PresentonWorkspaceDraft>(WORKSPACE_STORAGE_KEY);
}

export function savePresentonWorkspaceDraft(value: PresentonWorkspaceDraft): void {
    writeJson(WORKSPACE_STORAGE_KEY, value);
}

export function clearPresentonWorkspaceDraft(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(WORKSPACE_STORAGE_KEY);
}

export function clearPresentonDrafts(): void {
    clearPresentonSourceDraft();
    clearPresentonOutlineDraft();
    clearPresentonWorkspaceDraft();
}
