import type { Tab } from './types';

export const TAB_OPTIONS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'datasets', label: 'Datasets' },
    { key: 'runs', label: 'Runs' },
    { key: 'case-test', label: 'Case Test' },
    { key: 'compare', label: 'Compare' },
];

export const PERIOD_OPTIONS = [
    { label: '1h', h: 1 },
    { label: '6h', h: 6 },
    { label: '24h', h: 24 },
    { label: '7d', h: 168 },
] as const;

export const TOP_K_OPTIONS = [3, 5, 10, 15, 20] as const;
