import type { WorkbenchPane } from '../types/workbench';
import styles from '../styles/gradingWorkbench.module.css';

interface WorkbenchPaneTabsProps {
    activePane: WorkbenchPane;
    onChange: (pane: WorkbenchPane) => void;
}

export default function WorkbenchPaneTabs({ activePane, onChange }: WorkbenchPaneTabsProps) {
    return (
        <div className={styles.topTabs}>
            <button
                type="button"
                className={`${styles.topTabBtn} ${activePane === 'assistant' ? styles.topTabBtnActive : ''}`}
                onClick={() => onChange('assistant')}
            >
                <i className="fas fa-robot" /> PDF + Coze Assistant
            </button>
            <button
                type="button"
                className={`${styles.topTabBtn} ${activePane === 'scorer' ? styles.topTabBtnActive : ''}`}
                onClick={() => onChange('scorer')}
            >
                <i className="fas fa-check-circle" /> PDF + Grader
            </button>
        </div>
    );
}
