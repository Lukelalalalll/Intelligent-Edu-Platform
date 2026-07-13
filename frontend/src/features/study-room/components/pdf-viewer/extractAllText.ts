const MAX_EXTRACT_PAGES = 30;

export default async function extractAllText(pdfDocument: any) {
    const pages: string[] = [];
    const limit = Math.min(pdfDocument.numPages, MAX_EXTRACT_PAGES);

    for (let pageIndex = 1; pageIndex <= limit; pageIndex += 1) {
        const page = await pdfDocument.getPage(pageIndex);
        const textContent = await page.getTextContent();
        const parts: string[] = [];
        let lastY: number | null = null;

        for (const item of textContent.items) {
            if (!item.str) {
                continue;
            }

            const y = item.transform?.[5];
            if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
                parts.push('\n');
            } else if (parts.length > 0) {
                parts.push(' ');
            }

            parts.push(item.str);
            if (y !== undefined) {
                lastY = y;
            }
        }

        pages.push(parts.join(''));
    }

    return pages.join('\n\n');
}
