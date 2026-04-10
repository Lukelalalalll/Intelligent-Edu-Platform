const DEFAULT_PALETTE = {
    bg: '#f8fafc',
    card: '#ffffff',
    stroke: '#1f2937',
    primary: '#2563eb',
    accent: '#0d9488',
    text: '#0f172a',
    muted: '#64748b',
};

function collapseWhitespace(value: string): string {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeXml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function stripTags(value: string): string {
    return collapseWhitespace(String(value || '').replace(/<[^>]+>/g, ' '));
}

function splitLongLine(text: string, maxChars = 34): string[] {
    const words = collapseWhitespace(text).split(' ').filter(Boolean);
    if (!words.length) return [''];

    const lines: string[] = [];
    let current = '';
    for (const w of words) {
        const probe = current ? `${current} ${w}` : w;
        if (probe.length <= maxChars) {
            current = probe;
        } else {
            if (current) lines.push(current);
            current = w;
        }
    }
    if (current) lines.push(current);
    return lines.slice(0, 3);
}

function extractTextTokens(svg: string): string[] {
    const matches = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)];
    const raw = matches
        .map((m) => stripTags(m[1]))
        .map(collapseWhitespace)
        .filter((v) => v.length >= 2);

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    return unique;
}

function inferFallbackSteps(title: string): string[] {
    const lower = title.toLowerCase();
    if (lower.includes('software') && (lower.includes('development') || lower.includes('sdlc'))) {
        return ['Requirement Analysis', 'System Design', 'Implementation', 'Testing', 'Deployment'];
    }
    if (lower.includes('network') || lower.includes('tcp') || lower.includes('osi')) {
        return ['Physical Layer', 'Data Link Layer', 'Network Layer', 'Transport Layer', 'Application Layer'];
    }
    if (lower.includes('machine learning') || lower.includes('ml')) {
        return ['Data Collection', 'Preprocessing', 'Model Training', 'Evaluation', 'Deployment'];
    }
    return ['Overview', 'Core Components', 'Workflow', 'Validation', 'Final Output'];
}

function shouldRebuildReadableFlow(svg: string, tokens: string[]): boolean {
    if (tokens.length <= 1) return true;

    const lower = svg.toLowerCase();
    const hasHugeBlur = /stddeviation\s*=\s*["']([7-9]|[1-9]\d)/i.test(svg);
    const hasTextStroke = /<text\b[^>]*\bstroke\s*=\s*["'][^"']+["']/i.test(svg);
    const hasManyLabelsButFewShapes = tokens.length >= 4 && (lower.match(/<(rect|circle|ellipse|path|polygon|line|polyline)\b/g) || []).length < 3;
    const tinyViewBox = /viewbox\s*=\s*["']0\s+0\s+(?:[1-6]\d{2}|7\d{2})\s+(?:[1-4]\d{2}|5\d{2})["']/i.test(lower);

    return hasHugeBlur || hasTextStroke || hasManyLabelsButFewShapes || tinyViewBox;
}

function buildReadableFlowSvg(title: string, stepsInput: string[]): string {
    const steps = stepsInput.slice(0, 7);
    const width = 1400;
    const cardX = 120;
    const cardW = width - 240;
    const cardH = 108;
    const gap = 44;
    const top = 150;
    const canvasH = Math.max(860, top + steps.length * (cardH + gap) + 80);

    const cards: string[] = [];
    const arrows: string[] = [];

    for (let i = 0; i < steps.length; i += 1) {
        const y = top + i * (cardH + gap);
        cards.push(`<rect x="${cardX}" y="${y}" width="${cardW}" height="${cardH}" rx="18" ry="18" fill="${DEFAULT_PALETTE.card}" stroke="${DEFAULT_PALETTE.stroke}" stroke-width="2" filter="url(#soft-shadow)"/>`);

        const lines = splitLongLine(steps[i], 42);
        const lineStartY = y + 48 - (lines.length - 1) * 12;
        lines.forEach((line, idx) => {
            cards.push(`<text x="${cardX + 28}" y="${lineStartY + idx * 24}" font-size="20" font-family="Inter, Arial, sans-serif" fill="${DEFAULT_PALETTE.text}">${escapeXml(line)}</text>`);
        });

        if (i < steps.length - 1) {
            const cx = cardX + cardW / 2;
            arrows.push(`<line x1="${cx}" y1="${y + cardH}" x2="${cx}" y2="${y + cardH + gap - 10}" stroke="${DEFAULT_PALETTE.stroke}" stroke-width="2.5" marker-end="url(#arrow-end)"/>`);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${canvasH}">
  <defs>
    <marker id="arrow-end" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L12,4 L0,8 z" fill="${DEFAULT_PALETTE.stroke}" />
    </marker>
    <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.16" />
    </filter>
  </defs>
  <rect x="0" y="0" width="${width}" height="${canvasH}" fill="${DEFAULT_PALETTE.bg}"/>
  <text x="120" y="84" font-size="38" font-family="Inter, Arial, sans-serif" fill="${DEFAULT_PALETTE.text}">${escapeXml(title)}</text>
  ${arrows.join('\n  ')}
  ${cards.join('\n  ')}
</svg>`;
}

function removeProblematicEffects(svg: string): string {
    let next = svg;
    next = next.replace(/\sfilter\s*=\s*['"]url\([^'"]*\)['"]/gi, '');
    next = next.replace(/text-shadow\s*:[^;"']+;?/gi, '');
    next = next.replace(/<filter\b[\s\S]*?<\/filter>/gi, '');
    next = next.replace(/paint-order\s*=\s*['"][^'"]+['"]/gi, '');
    next = next.replace(/\sstroke\s*=\s*['"](?:#?0{3,6}|black|rgb\(0\s*,\s*0\s*,\s*0\))['"]/gi, '');
    return next;
}

function ensureSvgTag(svg: string): string {
    if (!svg || !svg.trim()) return svg;
    if (!/<svg\b/i.test(svg)) return svg;

    let next = svg;
    if (!/xmlns\s*=\s*['"]http:\/\/www\.w3\.org\/2000\/svg['"]/i.test(next)) {
        next = next.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!/viewBox\s*=\s*['"][^'"]+['"]/i.test(next)) {
        next = next.replace(/<svg\b([^>]*)>/i, '<svg$1 viewBox="0 0 1200 800">');
    }
    return next;
}

function ensureDefs(svg: string): string {
    let next = svg;

    if (!/<defs\b/i.test(next)) {
        next = next.replace(
            /<svg\b[^>]*>/i,
            (m) => `${m}\n<defs></defs>`
        );
    }

    if (!/id\s*=\s*['"]arrow-end['"]/i.test(next)) {
        next = next.replace(
            /<defs\b[^>]*>/i,
            (m) => `${m}
  <marker id="arrow-end" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L12,4 L0,8 z" fill="${DEFAULT_PALETTE.stroke}" />
  </marker>`
        );
    }

    if (!/id\s*=\s*['"]soft-shadow['"]/i.test(next)) {
        next = next.replace(
            /<defs\b[^>]*>/i,
            (m) => `${m}
  <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.18" />
  </filter>`
        );
    }

    return next;
}

function injectGlobalStyle(svg: string): string {
    const styleBlock = `
<style>
  text { font-family: Inter, Arial, sans-serif; fill: ${DEFAULT_PALETTE.text}; }
  rect, circle, ellipse, polygon { stroke: ${DEFAULT_PALETTE.stroke}; stroke-width: 2; }
  line, path, polyline { stroke: ${DEFAULT_PALETTE.stroke}; stroke-width: 2; fill: none; marker-end: url(#arrow-end); }
</style>`;

    if (/<style\b/i.test(svg)) {
        return svg;
    }

    if (/<defs\b/i.test(svg)) {
        return svg.replace(/<\/defs>/i, `${styleBlock}\n</defs>`);
    }

    return svg.replace(/<svg\b[^>]*>/i, (m) => `${m}${styleBlock}`);
}

function normalizeColors(svg: string): string {
    return svg
        .replace(/fill\s*=\s*['"]#fff(?:fff)?['"]/gi, `fill="${DEFAULT_PALETTE.card}"`)
        .replace(/fill\s*=\s*['"]white['"]/gi, `fill="${DEFAULT_PALETTE.card}"`)
        .replace(/stroke\s*=\s*['"]black['"]/gi, `stroke="${DEFAULT_PALETTE.stroke}"`)
        .replace(/fill\s*=\s*['"]black['"]/gi, `fill="${DEFAULT_PALETTE.text}"`);
}

function normalizeTextSize(svg: string): string {
    let next = svg;
    next = next.replace(/font-size\s*=\s*['"](\d+(?:\.\d+)?)px?['"]/gi, (_m, val) => {
        const size = Number(val);
        const clamped = Number.isFinite(size) ? Math.min(24, Math.max(14, size)) : 14;
        return `font-size="${clamped}"`;
    });

    if (!/font-size\s*=/i.test(next)) {
        next = next.replace(/<text\b/gi, '<text font-size="14"');
    }

    return next;
}

export function beautifySvg(rawSvg: string): string {
    let svg = String(rawSvg || '').trim();
    if (!svg) return svg;

    const tokens = extractTextTokens(svg);
    const title = tokens[0] || 'Generated Diagram';
    let steps = tokens.slice(1).filter((s) => s.length >= 2);
    if (steps.length < 3) {
        steps = inferFallbackSteps(title);
    }

    if (shouldRebuildReadableFlow(svg, tokens)) {
        return buildReadableFlowSvg(title, steps);
    }

    svg = ensureSvgTag(svg);
    svg = removeProblematicEffects(svg);
    svg = ensureDefs(svg);
    svg = injectGlobalStyle(svg);
    svg = normalizeColors(svg);
    svg = normalizeTextSize(svg);

    return svg;
}
