import React from 'react';
import styles from '../../styles/StudyRoom.module.css';

interface SelectionActionGridProps {
    onAction: (mode: string) => void;
}

const ACTIONS = [
    { mode: 'explain', icon: 'fa-lightbulb', label: 'Explain' },
    { mode: 'hint', icon: 'fa-search', label: 'Hint' },
    { mode: 'quiz', icon: 'fa-question-circle', label: 'Quiz' },
    { mode: 'simplify', icon: 'fa-compress-alt', label: 'Simplify' },
    { mode: 'expand', icon: 'fa-expand-alt', label: 'Expand' },
    { mode: 'note', icon: 'fa-sticky-note', label: 'Note', extraClassName: styles.selBtnNote },
];

export default function SelectionActionGrid({ onAction }: SelectionActionGridProps) {
    return (
        <div className={styles.selTipGrid}>
            {ACTIONS.map((action) => (
                <button
                    key={action.mode}
                    className={[styles.selBtn, action.extraClassName].filter(Boolean).join(' ')}
                    onClick={() => onAction(action.mode)}
                >
                    <i className={`fas ${action.icon}`}></i> {action.label}
                </button>
            ))}
        </div>
    );
}
