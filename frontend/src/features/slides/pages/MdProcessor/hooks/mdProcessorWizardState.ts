import type { AIProvider } from '../../../../../shared/aiProvider';

export type MdProcessorHeaderState = {
    index: number;
    level: number;
    text: string;
};

export type MdProcessorWizardState = {
    activeView: 'workflow' | 'history';
    currentStep: number;
    inputMode: 'file' | 'text';
    textContent: string;
    textTitle: string;
    seedContent: string;
    provider: AIProvider;
    currentFilename: string;
    currentDisplayFilename: string;
    headers: MdProcessorHeaderState[];
    selectedIndices: number[];
    useLLM: boolean;
    headerLlmProvider: 'local_ollama' | 'coze' | 'deepseek';
};

const STORAGE_KEY = 'ppt_generator_md_processor_wizard_state';

export function loadMdProcessorWizardState(): MdProcessorWizardState | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        return JSON.parse(raw) as MdProcessorWizardState;
    } catch {
        return null;
    }
}

export function saveMdProcessorWizardState(state: MdProcessorWizardState): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearMdProcessorWizardState(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(STORAGE_KEY);
}
