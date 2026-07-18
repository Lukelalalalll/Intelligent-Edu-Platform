import { describe, expect, it } from 'vitest';

import { formatPageRangeSummary, parsePageSelectionInput } from './pageSelection';

describe('pageSelection', () => {
    it('formats zero-based pages into human-readable ranges', () => {
        expect(formatPageRangeSummary([])).toBe('All pages');
        expect(formatPageRangeSummary([0, 1, 2, 5, 8, 9])).toBe('1-3, 6, 9-10');
    });

    it('parses page numbers and ranges into zero-based indexes', () => {
        expect(parsePageSelectionInput('1-3, 6, 3', 12)).toEqual({
            pages: [0, 1, 2, 5],
        });
    });

    it('rejects empty, malformed, and out-of-bounds selections', () => {
        expect(parsePageSelectionInput('', 12).error).toMatch(/Enter page numbers/);
        expect(parsePageSelectionInput('3-1', 12).error).toBe('Invalid page range: 3-1');
        expect(parsePageSelectionInput('13', 12).error).toBe('Page 13 exceeds the PDF page count.');
    });
});
