import type { RagCitation } from '@/types/api';

export function createRafBufferedUpdater(
    applySnapshot: (snapshot: string, citations?: RagCitation[]) => void,
    rafRef: React.MutableRefObject<number | null>,
) {
    let full = '';
    let citations: RagCitation[] | undefined;
    let providerNotice = '';

    const flush = () => {
        rafRef.current = null;
        const snapshot = providerNotice ? `${providerNotice}\n\n${full}` : full;
        applySnapshot(snapshot, citations);
    };

    const schedule = () => {
        if (rafRef.current == null) {
            rafRef.current = requestAnimationFrame(flush);
        }
    };

    const consumeSseObject = (obj: any) => {
        if (obj.meta?.citations) {
            citations = obj.meta.citations;
        }
        if (obj.meta?.fallback_from && obj.meta?.fallback_to) {
            providerNotice = `Provider switched: ${obj.meta.fallback_from} -> ${obj.meta.fallback_to}`;
            schedule();
            return;
        }
        if (obj.meta?.warning && !providerNotice) {
            providerNotice = `Provider notice: ${obj.meta.warning}`;
            schedule();
            return;
        }
        if (obj.error) {
            full += `\n\n**[Error]**: ${obj.error}`;
            schedule();
            return;
        }
        if (obj.choices?.[0]?.delta?.content !== undefined) {
            full += obj.choices[0].delta.content;
            schedule();
        }
    };

    const finalize = () => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        flush();
    };

    return { consumeSseObject, finalize };
}
