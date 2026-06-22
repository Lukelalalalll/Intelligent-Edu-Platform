import type { PresentonSourceMeta } from './presentonState';

const PRESENTON_UPLOAD_STEPS = [
    { key: 'upload', label: 'Upload' },
    { key: 'documents-preview', label: 'Documents Preview' },
    { key: 'outline', label: 'Outline' },
    { key: 'presentation', label: 'Presentation' },
] as const;

const PRESENTON_TEXT_STEPS = [
    { key: 'upload', label: 'Upload' },
    { key: 'outline', label: 'Outline' },
    { key: 'presentation', label: 'Presentation' },
] as const;

export function getPresentonSteps(kind?: PresentonSourceMeta['kind']) {
    return kind === 'text' ? [...PRESENTON_TEXT_STEPS] : [...PRESENTON_UPLOAD_STEPS];
}

export function getPresentonStepIndex(
    screen: 'upload' | 'documents-preview' | 'outline' | 'presentation',
    kind?: PresentonSourceMeta['kind'],
) {
    if (kind === 'text') {
        if (screen === 'upload') return 0;
        if (screen === 'outline') return 1;
        return 2;
    }

    if (screen === 'upload') return 0;
    if (screen === 'documents-preview') return 1;
    if (screen === 'outline') return 2;
    return 3;
}
