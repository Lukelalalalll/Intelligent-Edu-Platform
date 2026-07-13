import React from 'react';
import type { ToolSummary } from '../api/fileCenterHistoryApi';
import styles from '../styles/fileCenter.module.css';

const TOOL_ICONS: Record<string, string> = {
    slides: 'fa-file-powerpoint',
    questions: 'fa-question-circle',
    image_extractor: 'fa-images',
    diagram: 'fa-project-diagram',
    study_notes: 'fa-book-open',
    video: 'fa-video',
};

interface Props {
    tools: ToolSummary[];
    activeTool: string;
    onSelect: (tool: string) => void;
}

export default function ToolSummaryCards({ tools, activeTool, onSelect }: Props) {
    return (
        <div className={styles.summaryGrid}>
            {tools.map((t) => (
                <button
                    key={t.tool}
                    type="button"
                    className={`${styles.summaryCard} ${activeTool === t.tool ? styles.summaryCardActive : ''}`}
                    onClick={() => onSelect(t.tool)}
                >
                    <div className={styles.summaryIcon}>
                        <i className={`fas ${TOOL_ICONS[t.tool] || 'fa-folder'}`} />
                    </div>
                    <p className={styles.summaryLabel}>{t.label}</p>
                    <p className={styles.summaryCount}>{t.count}</p>
                </button>
            ))}
        </div>
    );
}
