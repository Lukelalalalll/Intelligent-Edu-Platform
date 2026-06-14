import type React from 'react';
import styles from '../styles/PptTemplateSteps.module.css';
import type { ThemeItem } from '../types';

type Props = {
    themes: ThemeItem[];
    visibleThemes: ThemeItem[];
    selectedTheme: string | null;
    getThemePreviewSrc: (name: string) => string;
    onThemePreviewError: (e: React.SyntheticEvent<HTMLImageElement>, themeName: string) => void;
    onThemeSelect: (themeName: string) => void;
};

export default function ThemeStepView({
    themes,
    visibleThemes,
    selectedTheme,
    getThemePreviewSrc,
    onThemePreviewError,
    onThemeSelect,
}: Props) {
    return (
        <div className={`card ${styles.sectionCard} ${styles.cardStep1}`}>
            <h5 className="card-title mb-4">
                <i className="fas fa-paint-brush" aria-hidden="true" /> 1. Choose Presentation Theme
            </h5>
            <div className={styles.themeGrid}>
                {visibleThemes.map((theme) => (
                    <div
                        key={theme.name}
                        className={`${styles.themeCard} ${selectedTheme === theme.name ? styles.selected : ''}`}
                        onClick={() => onThemeSelect(theme.name)}
                    >
                        <div className={styles.previewBox}>
                            <img
                                src={getThemePreviewSrc(theme.name)}
                                alt={theme.name}
                                loading="lazy"
                                decoding="async"
                                onError={(e) => onThemePreviewError(e, theme.name)}
                            />
                        </div>
                        <div className={styles.cardInfo}>
                            <h5 className={styles.themeName}>{theme.name}</h5>
                            <p className={styles.themeDesc}>{theme.description || 'Professional theme'}</p>
                        </div>
                    </div>
                ))}
            </div>
            {themes.length === 0 && (
                <div className={`alert alert-info ${styles.infoBlock}`} role="alert">
                    No PPT themes found. Place template files (.pptx) in backend/static/ppt_templates and refresh.
                </div>
            )}
        </div>
    );
}
