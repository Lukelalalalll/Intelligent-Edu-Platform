import React from 'react';
import type { LayoutItem, ThemeItem } from '../types';

type Props = {
    styles: Record<string, string>;
    themeKeyword: string;
    setThemeKeyword: (value: string) => void;
    availableFamilies: string[];
    activeFamilyFilter: string;
    setActiveFamilyFilter: (value: string) => void;
    themeSortMode: 'relevance' | 'name' | 'layouts';
    setThemeSortMode: (value: 'relevance' | 'name' | 'layouts') => void;
    groupedThemes: Array<[string, ThemeItem[]]>;
    selectedThemeMeta: ThemeItem | null;
    expandedThemeGroups: Record<string, boolean>;
    setExpandedThemeGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    selectedTheme: string;
    selectTheme: (name: string) => void;
    themePreviewLayouts: Record<string, LayoutItem | null>;
    getPreviewPlaceholders: (layout: LayoutItem) => Array<{ key: string; left: number; top: number; width: number; height: number; type: string }>;
    getPlaceholderTone: (type: string) => string;
    getThemeGradient: (name: string) => string;
    getThemeLayoutCount: (theme: ThemeItem) => number;
    formatFamilyTitle: (name: string) => string;
};

export default function ThemeFamiliesSection({
    styles,
    themeKeyword,
    setThemeKeyword,
    availableFamilies,
    activeFamilyFilter,
    setActiveFamilyFilter,
    themeSortMode,
    setThemeSortMode,
    groupedThemes,
    selectedThemeMeta,
    expandedThemeGroups,
    setExpandedThemeGroups,
    selectedTheme,
    selectTheme,
    themePreviewLayouts,
    getPreviewPlaceholders,
    getPlaceholderTone,
    getThemeGradient,
    getThemeLayoutCount,
    formatFamilyTitle,
}: Props) {
    return (
        <section className={`card ${styles.sectionCard}`}>
            <div className={styles.cardHeader}>
                <div className={styles.cardIcon}><i className="fas fa-paint-brush"></i></div>
                <h2 className={styles.sectionTitle}>Template Families</h2>
            </div>

            <div className={styles.searchRow}>
                <input
                    type="text"
                    className="form-control"
                    placeholder="Search themes by name, description, or base family"
                    value={themeKeyword}
                    onChange={(e) => setThemeKeyword(e.target.value)}
                />
            </div>

            <div className={styles.themeToolbarRow}>
                <div className={styles.familyFilterRow}>
                    <button
                        type="button"
                        className={`${styles.familyChip} ${activeFamilyFilter === 'all' ? styles.familyChipActive : ''}`}
                        onClick={() => setActiveFamilyFilter('all')}
                    >
                        All families
                    </button>
                    {availableFamilies.map((family) => (
                        <button
                            key={family}
                            type="button"
                            className={`${styles.familyChip} ${activeFamilyFilter === family ? styles.familyChipActive : ''}`}
                            onClick={() => setActiveFamilyFilter(family)}
                            title={family}
                        >
                            {formatFamilyTitle(family)}
                        </button>
                    ))}
                </div>
                <select
                    className={`form-select ${styles.sortSelect}`}
                    value={themeSortMode}
                    onChange={(e) => setThemeSortMode(e.target.value as 'relevance' | 'name' | 'layouts')}
                >
                    <option value="relevance">Sort: Relevance</option>
                    <option value="name">Sort: Name</option>
                    <option value="layouts">Sort: Layout Count</option>
                </select>
            </div>

            <div className={styles.themeGroups}>
                {groupedThemes.map(([groupName, groupThemes]) => {
                    const selectedFamily = selectedThemeMeta?.source_group === groupName || selectedThemeMeta?.base_theme === groupName;
                    const isOpen = expandedThemeGroups[groupName] ?? false;

                    return (
                        <section key={groupName} className={styles.themeGroup}>
                            <button
                                type="button"
                                className={`${styles.themeGroupHeader} ${selectedFamily ? styles.themeGroupHeaderActive : ''}`}
                                onClick={() => setExpandedThemeGroups((prev) => ({ ...prev, [groupName]: !prev[groupName] }))}
                            >
                                <div className={styles.themeGroupTitleRow}>
                                    <h4 className={styles.themeGroupTitle}>{formatFamilyTitle(groupName)}</h4>
                                    <div className={styles.themeGroupMeta}>
                                        <span>{groupThemes.length} variants</span>
                                        <span>{groupThemes.reduce((sum, t) => sum + getThemeLayoutCount(t), 0) || '-'} layouts</span>
                                    </div>
                                </div>
                                <i className={`fas ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} ${styles.themeGroupChevron}`}></i>
                            </button>

                            {isOpen && (
                                <div className={styles.themeGroupBody}>
                                    <div className={styles.themeGroupGrid}>
                                        {groupThemes.map((theme) => {
                                            const selected = selectedTheme === theme.name;
                                            const previewLayout = themePreviewLayouts[theme.name] || null;
                                            const previewBlocks = previewLayout ? getPreviewPlaceholders(previewLayout) : [];
                                            const layoutCount = getThemeLayoutCount(theme);
                                            return (
                                                <button
                                                    key={theme.name}
                                                    type="button"
                                                    className={`${styles.themeCard} ${selected ? styles.selected : ''}`}
                                                    onClick={() => selectTheme(theme.name)}
                                                >
                                                    <div className={styles.previewBox}>
                                                        <div className={styles.themePreviewCard} style={{ background: !previewLayout ? getThemeGradient(theme.name) : undefined }}>
                                                            {previewBlocks.length > 0 && (
                                                                <div className={styles.themeLayoutPreviewFrame}>
                                                                    {previewBlocks.map((p) => (
                                                                        <span
                                                                            key={p.key}
                                                                            className={`${styles.layoutPreviewBlock} ${getPlaceholderTone(p.type)}`}
                                                                            style={{
                                                                                left: `${p.left * 100}%`,
                                                                                top: `${p.top * 100}%`,
                                                                                width: `${p.width * 100}%`,
                                                                                height: `${p.height * 100}%`,
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <span className={styles.themePreviewBadge}>Layouts {layoutCount || '-'}</span>
                                                            <div className={styles.themePreviewLabel}>{formatFamilyTitle(groupName)}</div>
                                                        </div>
                                                    </div>
                                                    <div className={styles.cardInfo}>
                                                        <div className={styles.groupPill}>{theme.source || 'template'} source</div>
                                                        <h5 className={styles.themeName}>{theme.name}</h5>
                                                        <p className={styles.themeDesc}>{theme.description || 'Professional theme'}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </section>
    );
}
