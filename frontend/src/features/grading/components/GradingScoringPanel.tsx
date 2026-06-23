import RubricPanel from './RubricPanel';
import styles from '../styles/gradingWorkbench.module.css';
import type {
    WorkbenchGrade,
    WorkbenchRubric,
} from '../types/workbench';

interface GradingScoringPanelProps {
    rubric: WorkbenchRubric;
    existingScores: WorkbenchGrade | null;
    onSave: (data: WorkbenchGrade) => Promise<void>;
}

export default function GradingScoringPanel({ rubric, existingScores, onSave }: GradingScoringPanelProps) {
    return (
        <div className={`${styles.card} ${styles.pane} ${styles.scorePane}`}>
            <RubricPanel
                rubric={rubric}
                existingScores={existingScores}
                onSave={onSave}
            />
        </div>
    );
}
