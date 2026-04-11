import type { DeliveryArtifactType } from '../../../../../api/slidesDeliveryApi';

export async function copyTextToClipboard(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
    }
}

export function formatDeliveryItem(item: any, tab: DeliveryArtifactType): { lines: string[]; copyText: string } {
    if (typeof item === 'string') {
        return { lines: [item], copyText: item };
    }
    if (!item || typeof item !== 'object') {
        const fallback = String(item ?? '');
        return { lines: [fallback], copyText: fallback };
    }

    if (tab === 'speaker_notes') {
        const lines = [`Slide ${item.slide ?? '-'}`, `Title: ${item.title ?? '-'}`, `Note: ${item.note ?? '-'}`];
        return { lines, copyText: lines.join('\n') };
    }

    if (tab === 'in_class_questions') {
        const lines = [
            `Slide ${item.slide ?? '-'}`,
            `Question: ${item.question ?? '-'}`,
            `Expected Depth: ${item.expected_depth ?? '-'}`,
        ];
        return { lines, copyText: lines.join('\n') };
    }

    if (tab === 'homework_suggestions') {
        const lines = [
            `Task ID: ${item.task_id ?? '-'}`,
            `Prompt: ${item.prompt ?? '-'}`,
            `Estimated Minutes: ${item.estimated_minutes ?? '-'}`,
        ];
        return { lines, copyText: lines.join('\n') };
    }

    const genericLines = Object.entries(item).map(([k, v]) => `${k}: ${String(v ?? '-')}`);
    return { lines: genericLines, copyText: genericLines.join('\n') };
}
