type ThemeFamily = 'Business' | 'Classic' | 'Dark' | 'Light';

// These lists mirror exactly what is on disk in backend/static/img/{family}/.
// Only include layouts that should appear in the manual picker (auto-managed
// pages like Title / Section / Ending are intentionally absent).
const FAMILY_FILES: Record<ThemeFamily, string[]> = {
    Business: [
        'Bullet Listing_dynamic.png',
        'Icon with Text_dynamic.png',
        'Picture & Diagram_Horizontal.png',
        'Picture & Diagram_Vertical.png',
        'Rectangular Style_dynamic.png',
    ],
    Classic: [
        'B1-D1-H.png',
        'B1-D1-V.png',
        'B1-P1-D1-H.png',
        'B1-P1-H.png',
        'B1-P1-V.png',
    ],
    Dark: [
        '2 Pictures & Diagram.png',
        'Picture & Diagram_Horizontal.png',
        'Picture & Diagram_Vertical.png',
        'Picture & Diagram_Vertical_reverse.png',
        'Single Picture.png',
    ],
    Light: [
        'Chart layout 1.png',
        'Chart layout 2.png',
        'Chart .png',
        'Title and 2 Column Content.png',
        'Title and 2 content.png',
        'Title and content 2.png',
        'Custom Layout.png',
        '标题和内容.png',
        '自定义版式.png',
    ],
};

function normalizeName(raw: string): string {
    return String(raw || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\.(png|jpg|jpeg|webp)$/i, '')
        .replace(/[\s_&-]+/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

function resolveFamily(raw: string): ThemeFamily | null {
    const low = String(raw || '').toLowerCase();
    if (low.includes('business')) return 'Business';
    if (low.includes('classic')) return 'Classic';
    if (low.includes('dark')) return 'Dark';
    if (low.includes('light')) return 'Light';
    return null;
}

function apiRootPrefix(): string {
    const root = String(import.meta.env.VITE_API_ROOT || '').trim().replace(/\/$/, '');
    return root;
}

export function resolveLayoutImageUrl(themeFamilyOrName: string, layoutName: string): string | null {
    const family = resolveFamily(themeFamilyOrName);
    if (!family) return null;

    const files = FAMILY_FILES[family] || [];
    if (files.length === 0) return null;

    const target = normalizeName(layoutName);
    if (!target) return null;

    const exact = files.find((f) => normalizeName(f) === target);
    const fuzzy = exact || files.find((f) => {
        const n = normalizeName(f);
        return n.includes(target) || target.includes(n);
    });
    if (!fuzzy) return null;

    const encoded = fuzzy.split('/').map(encodeURIComponent).join('/');
    const prefix = apiRootPrefix();
    const path = `/static/img/${family}/${encoded}`;
    return prefix ? `${prefix}${path}` : path;
}
