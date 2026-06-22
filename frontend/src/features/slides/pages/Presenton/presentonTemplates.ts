import type { SlidesThemeItem } from '../../api/slidesApi';

function normalizeTemplateKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-');
}

export const PRESENTON_TEMPLATE_FAMILIES: SlidesThemeItem[] = [
    {
        name: 'General',
        description: 'General purpose layouts for common presentation elements',
        base_theme: 'Light',
        preview_theme: 'Light',
        source: 'presenton_main',
        source_group: 'general',
        layout_count: 12,
    },
    {
        name: 'Modern',
        description: 'Modern white and blue business pitch deck layouts with clean, professional design',
        base_theme: 'Business',
        preview_theme: 'Business',
        source: 'presenton_main',
        source_group: 'modern',
        layout_count: 10,
    },
    {
        name: 'Standard',
        description: 'Standard layouts for presentations',
        base_theme: 'Classic',
        preview_theme: 'Classic',
        source: 'presenton_main',
        source_group: 'standard',
        layout_count: 11,
    },
    {
        name: 'Swift',
        description: 'Swift layouts for presentations',
        base_theme: 'Dark',
        preview_theme: 'Dark',
        source: 'presenton_main',
        source_group: 'swift',
        layout_count: 9,
    },
    {
        name: 'Code',
        description: 'Developer-focused layouts for code blocks, diffs, terminal commands, file trees, APIs, and technical metrics',
        base_theme: 'Dark',
        preview_theme: 'Dark',
        source: 'presenton_main',
        source_group: 'code',
        layout_count: 16,
    },
    {
        name: 'Education',
        description: 'School and training layouts for outcomes, curriculum maps, lesson plans, rubrics, timelines, statistics, and closing Q&A',
        base_theme: 'Classic',
        preview_theme: 'Classic',
        source: 'presenton_main',
        source_group: 'education',
        layout_count: 14,
    },
    {
        name: 'Product Overview',
        description: 'Product overview layouts using covers, text sections, comparison tables, card grids, timelines, metrics, pricing, team, and closing structures',
        base_theme: 'Business',
        preview_theme: 'Business',
        source: 'presenton_main',
        source_group: 'product-overview',
        layout_count: 21,
    },
    {
        name: 'Report',
        description: 'Data and narrative report layouts for summaries, section indexes, methodology, findings, charts, risks, actions, appendix notes, and closing structures',
        base_theme: 'Business',
        preview_theme: 'Business',
        source: 'presenton_main',
        source_group: 'report',
        layout_count: 22,
    },
    {
        name: 'Pitch Deck',
        description: 'Presentation templates for pitch decks, including cover, problem, value proposition, product workflow, market size, business model, traction, go-to-market, positioning, financials, funding, team, and closing slides',
        base_theme: 'Business',
        preview_theme: 'Business',
        source: 'presenton_main',
        source_group: 'pitch-deck',
        layout_count: 25,
    },
    {
        name: 'Neo General',
        description: 'New general purpose layouts for common presentation elements',
        base_theme: 'Light',
        preview_theme: 'Light',
        source: 'presenton_main',
        source_group: 'neo-general',
        layout_count: 29,
    },
    {
        name: 'Neo Standard',
        description: 'New standard purpose layouts for common presentation elements',
        base_theme: 'Classic',
        preview_theme: 'Classic',
        source: 'presenton_main',
        source_group: 'neo-standard',
        layout_count: 17,
    },
    {
        name: 'Neo Modern',
        description: 'New modern purpose layouts for common presentation elements',
        base_theme: 'Business',
        preview_theme: 'Business',
        source: 'presenton_main',
        source_group: 'neo-modern',
        layout_count: 17,
    },
    {
        name: 'Neo Swift',
        description: 'New swift purpose layouts for common presentation elements',
        base_theme: 'Dark',
        preview_theme: 'Dark',
        source: 'presenton_main',
        source_group: 'neo-swift',
        layout_count: 15,
    },
];

export function getDefaultPresentonTemplateFamily(): SlidesThemeItem {
    return PRESENTON_TEMPLATE_FAMILIES[0];
}

export function findPresentonTemplateFamilyByName(value: string | null | undefined): SlidesThemeItem | undefined {
    if (!value) return undefined;
    const normalized = normalizeTemplateKey(value);
    return PRESENTON_TEMPLATE_FAMILIES.find((item) => (
        normalizeTemplateKey(item.name) === normalized
        || normalizeTemplateKey(item.source_group || '') === normalized
    ));
}
