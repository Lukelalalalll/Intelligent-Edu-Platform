export function formatPageRangeSummary(pageNumbers: number[]): string {
    if (pageNumbers.length === 0) return 'All pages';
    const humanPages = [...pageNumbers].sort((a, b) => a - b).map((value) => value + 1);
    const ranges: string[] = [];
    let start = humanPages[0];
    let previous = humanPages[0];

    for (const page of humanPages.slice(1)) {
        if (page === previous + 1) {
            previous = page;
            continue;
        }
        ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
        start = previous = page;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    return ranges.join(', ');
}

export function parsePageSelectionInput(input: string, totalPages: number): { pages: number[]; error?: string } {
    const trimmed = input.trim();
    if (!trimmed) {
        return { pages: [], error: 'Enter page numbers such as 1-3, 6, 9.' };
    }
    const pages = new Set<number>();
    const segments = trimmed.split(',').map((segment) => segment.trim()).filter(Boolean);

    for (const segment of segments) {
        const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(segment);
        if (rangeMatch) {
            const start = Number(rangeMatch[1]);
            const end = Number(rangeMatch[2]);
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
                return { pages: [], error: `Invalid page range: ${segment}` };
            }
            if (totalPages > 0 && end > totalPages) {
                return { pages: [], error: `Page range ${segment} exceeds the PDF page count.` };
            }
            for (let page = start; page <= end; page += 1) {
                pages.add(page - 1);
            }
            continue;
        }

        const page = Number(segment);
        if (!Number.isInteger(page) || page < 1) {
            return { pages: [], error: `Invalid page number: ${segment}` };
        }
        if (totalPages > 0 && page > totalPages) {
            return { pages: [], error: `Page ${page} exceeds the PDF page count.` };
        }
        pages.add(page - 1);
    }

    return { pages: [...pages].sort((a, b) => a - b) };
}
