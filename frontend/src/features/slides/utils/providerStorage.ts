import type { SlidesProvider } from '../types';

const SLIDES_PROVIDER_STORAGE_KEY = 'slides_provider';
const SLIDES_PROVIDER_VALUES: SlidesProvider[] = ['auto', 'openai', 'deepseek', 'local_ollama', 'coze'];

export function getStoredSlidesProvider(): SlidesProvider {
    if (typeof window === 'undefined') return 'auto';
    const raw = window.localStorage.getItem(SLIDES_PROVIDER_STORAGE_KEY);
    return SLIDES_PROVIDER_VALUES.includes(raw as SlidesProvider) ? (raw as SlidesProvider) : 'auto';
}

export function setStoredSlidesProvider(provider: SlidesProvider): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SLIDES_PROVIDER_STORAGE_KEY, provider);
}
