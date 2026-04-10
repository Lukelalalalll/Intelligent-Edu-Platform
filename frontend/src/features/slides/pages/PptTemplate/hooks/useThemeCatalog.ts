import { useEffect, useMemo, useState } from 'react';
import client from '../../../../../api/client';
import { useDebouncedValue } from '../hooks';
import type { LayoutItem, ThemeItem, ThemeLayoutCountCache, ThemePreviewCache } from '../types';
import { getPreviewPlaceholders } from '../utils/previewUtils';

type SortMode = 'relevance' | 'name' | 'layouts';

export function useThemeCatalog(themes: any[], selectedTheme: string) {
    const [themeKeyword, setThemeKeyword] = useState('');
    const [themeSortMode, setThemeSortMode] = useState<SortMode>('relevance');
    const [activeFamilyFilter, setActiveFamilyFilter] = useState<string>('all');
    const [expandedThemeGroups, setExpandedThemeGroups] = useState<Record<string, boolean>>({});
    const [themePreviewLayouts, setThemePreviewLayouts] = useState<ThemePreviewCache>({});
    const [themeLayoutCounts, setThemeLayoutCounts] = useState<ThemeLayoutCountCache>({});

    const debouncedThemeKeyword = useDebouncedValue(themeKeyword);

    const normalizedThemes: ThemeItem[] = useMemo(() => {
        if (!Array.isArray(themes)) return [];
        return themes.map((theme: any) => ({
            name: theme?.name || 'Unnamed Theme',
            description: theme?.description || 'Professional theme',
            base_theme: theme?.base_theme || theme?.name,
            preview_theme: theme?.preview_theme || theme?.base_theme || theme?.name,
            source: theme?.source,
            source_group: theme?.source_group,
            layout_count: Number.isFinite(theme?.layout_count) ? theme.layout_count : undefined,
        }));
    }, [themes]);

    const selectedThemeMeta = useMemo(
        () => normalizedThemes.find((t) => t.name === selectedTheme) || null,
        [normalizedThemes, selectedTheme],
    );

    const visibleThemes = useMemo(() => {
        const q = debouncedThemeKeyword.trim().toLowerCase();
        const familyFiltered = activeFamilyFilter === 'all'
            ? normalizedThemes
            : normalizedThemes.filter((theme) => (theme.source_group || theme.base_theme || 'default') === activeFamilyFilter);

        const keywordFiltered = !q ? familyFiltered : familyFiltered.filter((theme) => {
            const haystack = `${theme.name} ${theme.description || ''} ${theme.base_theme || ''}`.toLowerCase();
            return haystack.includes(q);
        });

        if (themeSortMode === 'name') {
            return [...keywordFiltered].sort((a, b) => a.name.localeCompare(b.name));
        }

        if (themeSortMode === 'layouts') {
            return [...keywordFiltered].sort((a, b) => (b.layout_count || 0) - (a.layout_count || 0));
        }

        return keywordFiltered;
    }, [normalizedThemes, debouncedThemeKeyword, themeSortMode, activeFamilyFilter]);

    const groupedThemes = useMemo(() => {
        const groups: Record<string, ThemeItem[]> = {};
        visibleThemes.forEach((theme) => {
            const key = theme.source_group || theme.base_theme || 'default';
            if (!groups[key]) groups[key] = [];
            groups[key].push(theme);
        });
        return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
    }, [visibleThemes]);

    const availableFamilies = useMemo(() => {
        const set = new Set<string>();
        normalizedThemes.forEach((theme) => {
            set.add(theme.source_group || theme.base_theme || 'default');
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [normalizedThemes]);

    useEffect(() => {
        let cancelled = false;

        const pickPreviewLayout = (allLayouts: LayoutItem[]): LayoutItem | null => {
            if (!Array.isArray(allLayouts) || allLayouts.length === 0) return null;
            const withGeometry = allLayouts.filter((layout) => getPreviewPlaceholders(layout).length > 0);
            if (withGeometry.length === 0) return allLayouts[0] || null;
            return [...withGeometry].sort(
                (a, b) => getPreviewPlaceholders(b).length - getPreviewPlaceholders(a).length,
            )[0];
        };

        const targets = visibleThemes.slice(0, 12).map((t) => t.name);
        if (selectedTheme && !targets.includes(selectedTheme)) {
            targets.push(selectedTheme);
        }

        const toFetch = targets.filter((name) => !(name in themePreviewLayouts));
        if (toFetch.length === 0) return () => { cancelled = true; };

        Promise.all(
            toFetch.map(async (themeName) => {
                try {
                    const res = await client.get(`/slides/get_placeholders/${themeName}`);
                    const fetchedLayouts = Array.isArray(res.data) ? res.data : [];
                    return {
                        themeName,
                        preview: pickPreviewLayout(fetchedLayouts),
                        count: fetchedLayouts.length,
                    };
                } catch {
                    return { themeName, preview: null, count: 0 };
                }
            }),
        ).then((results) => {
            if (cancelled) return;
            setThemePreviewLayouts((prev) => {
                const next = { ...prev };
                results.forEach((r) => {
                    next[r.themeName] = r.preview;
                });
                return next;
            });
            setThemeLayoutCounts((prev) => {
                const next = { ...prev };
                results.forEach((r) => {
                    next[r.themeName] = r.count;
                });
                return next;
            });
        });

        return () => {
            cancelled = true;
        };
    }, [visibleThemes, selectedTheme, themePreviewLayouts]);

    useEffect(() => {
        const searchMode = debouncedThemeKeyword.trim().length > 0;
        const selectedGroup = selectedThemeMeta?.source_group || selectedThemeMeta?.base_theme || '';

        setExpandedThemeGroups((prev) => {
            const next: Record<string, boolean> = { ...prev };
            groupedThemes.forEach(([groupName]) => {
                if (!(groupName in next)) {
                    next[groupName] = searchMode || groupName === selectedGroup;
                }
                if (searchMode) next[groupName] = true;
            });
            return next;
        });
    }, [groupedThemes, selectedThemeMeta, debouncedThemeKeyword]);

    const getThemeLayoutCount = (theme: ThemeItem) => theme.layout_count ?? themeLayoutCounts[theme.name] ?? 0;

    return {
        themeKeyword,
        setThemeKeyword,
        themeSortMode,
        setThemeSortMode,
        activeFamilyFilter,
        setActiveFamilyFilter,
        expandedThemeGroups,
        setExpandedThemeGroups,
        themePreviewLayouts,
        normalizedThemes,
        selectedThemeMeta,
        groupedThemes,
        availableFamilies,
        getThemeLayoutCount,
    };
}
