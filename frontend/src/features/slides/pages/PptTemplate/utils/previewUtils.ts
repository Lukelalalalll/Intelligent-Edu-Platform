import type { LayoutItem, PreviewBlock } from '../types';

export function getPreviewPlaceholders(layout: LayoutItem): PreviewBlock[] {
    const placeholders = Array.isArray(layout?.placeholders) ? layout.placeholders : [];
    const raw = placeholders
        .filter((p) => Number.isFinite(p.left) && Number.isFinite(p.top) && Number.isFinite(p.width) && Number.isFinite(p.height))
        .map((p) => ({
            left: Number(p.left),
            top: Number(p.top),
            width: Number(p.width),
            height: Number(p.height),
            type: String(p.type ?? ''),
            idx: p.idx,
            name: p.name,
        }));

    if (raw.length === 0) return [];

    const maxRight = Math.max(...raw.map((p) => p.left + p.width));
    const maxBottom = Math.max(...raw.map((p) => p.top + p.height));
    const alreadyNormalized = maxRight <= 1.2 && maxBottom <= 1.2;
    const baseW = alreadyNormalized ? 1 : Math.max(maxRight, 1);
    const baseH = alreadyNormalized ? 1 : Math.max(maxBottom, 1);

    return raw.map((p, idx) => ({
        key: `${p.idx || idx}-${p.name || 'ph'}`,
        left: Math.max(0, Math.min(1, p.left / baseW)),
        top: Math.max(0, Math.min(1, p.top / baseH)),
        width: Math.max(0.05, Math.min(1, p.width / baseW)),
        height: Math.max(0.05, Math.min(1, p.height / baseH)),
        type: p.type,
    }));
}

function getThemeSeed(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function getThemeGradient(name: string): string {
    const seed = getThemeSeed(name || 'theme');
    const h1 = seed % 360;
    const h2 = (h1 + 36 + (seed % 73)) % 360;
    return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 72% 38%))`;
}

export function formatFamilyTitle(name: string): string {
    return name.replace(/-/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function getPlaceholderTone(type: string, styles: Record<string, string>): string {
    if (type === 'TITLE' || type === '1') return styles.placeholderTitle;
    if (type === 'PICTURE' || type === '18') return styles.placeholderImage;
    return styles.placeholderBody;
}

export function getPreviewBlockText(type: string, index: number, currentSlide: any): string {
    if (type === 'TITLE' || type === '1') {
        return String(currentSlide?.title || 'Title');
    }
    if (type === 'PICTURE' || type === '18' || type === '7') {
        return 'Image / Diagram';
    }
    const bullets = Array.isArray(currentSlide?.content) ? currentSlide.content : [];
    return String(bullets[index] || bullets[0] || 'Content');
}
