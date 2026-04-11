import { extractPdfText as extractPdfTextFromServer } from '@/api/aiApi';

interface PdfTextItem {
    str?: string;
}

interface PdfPage {
    getTextContent(): Promise<{ items?: PdfTextItem[] }>;
}

interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
    destroy(): Promise<void> | void;
}

interface PdfJsModule {
    getDocument(options: { data: ArrayBuffer; disableWorker: boolean }): { promise: Promise<PdfDocumentProxy> };
}

interface PendingAttachment {
    file?: File;
}

export type AttachmentInput = PendingAttachment | File;

const MAX_PDF_EXTRACT_CHARS = 10000;

async function fileToBase64Payload(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const payload = result.includes(',') ? result.split(',')[1] : result;
            resolve(payload || '');
        };
        reader.onerror = () => reject(new Error('Failed to read file as base64'));
        reader.readAsDataURL(file);
    });
}

async function extractPdfTextFromBrowser(file: File, maxChars: number = MAX_PDF_EXTRACT_CHARS): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfJsModule;
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer(), disableWorker: true });
    const doc = await loadingTask.promise;
    const chunks: string[] = [];
    let totalChars = 0;

    try {
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
            const page = await doc.getPage(pageNo);
            const content = await page.getTextContent();
            const pageText = (content.items || [])
                .map((it: PdfTextItem) => String(it?.str || '').trim())
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (!pageText) continue;
            const remaining = maxChars - totalChars;
            if (remaining <= 0) break;
            const sliced = pageText.slice(0, remaining);
            chunks.push(`[Page ${pageNo}] ${sliced}`);
            totalChars += sliced.length;
            if (totalChars >= maxChars) break;
        }
    } finally {
        try {
            await doc.destroy();
        } catch {
            // no-op
        }
    }

    return chunks.join('\n\n');
}

export async function prepareAttachmentPayload(attachedFiles: AttachmentInput[]): Promise<{
    images: string[];
    attachmentNotes: string[];
    filesMeta: Array<{ file_name: string; mime_type: string }>;
}> {
    const images: string[] = [];
    const attachmentNotes: string[] = [];
    const filesMeta: { file_name: string; mime_type: string }[] = [];

    for (const f of attachedFiles) {
        const file = (typeof f === 'object' && f && 'file' in f && f.file instanceof File ? f.file : f) as File | undefined;
        if (!file) continue;

        if ((file.type || '').startsWith('image/')) {
            const base64 = await fileToBase64Payload(file);
            if (base64) images.push(base64);
            continue;
        }

        filesMeta.push({ file_name: file.name, mime_type: file.type || 'application/octet-stream' });

        if ((file.type || '') === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf')) {
            try {
                // Prefer server extraction for consistency across browsers and PDFs.
                let extracted = '';
                try {
                    const serverResult = await extractPdfTextFromServer(file);
                    extracted = String(serverResult?.text || '');
                } catch {
                    extracted = '';
                }

                // Browser extraction as fallback when backend extraction is unavailable.
                if (!extracted) {
                    extracted = await extractPdfTextFromBrowser(file);
                }

                if (extracted) {
                    const normalized = extracted.replace(/\s+/g, ' ').trim().slice(0, MAX_PDF_EXTRACT_CHARS);
                    attachmentNotes.push(
                        [
                            `Attached PDF (converted to text): ${file.name}`,
                            'Use the converted text below as the attachment content:',
                            normalized,
                        ].join('\n')
                    );
                } else {
                    attachmentNotes.push(`Attached PDF: ${file.name} (No extractable text found; this file may be image-only or scanned)`);
                }
            } catch {
                attachmentNotes.push(`Attached PDF: ${file.name} (Text extraction failed)`);
            }
            continue;
        }

        attachmentNotes.push(`Attached file: ${file.name} (${file.type || 'unknown type'})`);
    }

    return { images, attachmentNotes, filesMeta };
}
