import type { AIProvider } from '../../../shared/aiProvider';
import CozeAssistant from './CozeAssistant';
import chatStyles from '../styles/gradingChat.module.css';
import styles from '../styles/gradingWorkbench.module.css';
import type { WorkbenchAssignment, WorkbenchRubric } from '../types/workbench';

interface GradingAssistantPanelProps {
    submissionId?: string;
    assignment?: WorkbenchAssignment | null;
    rubric: WorkbenchRubric;
    onAnalysis: (analysis: Record<string, unknown>) => void;
    provider: AIProvider;
    setProvider: (provider: AIProvider) => void;
}

export default function GradingAssistantPanel({
    submissionId,
    assignment,
    rubric,
    onAnalysis,
    provider,
    setProvider,
}: GradingAssistantPanelProps) {
    return (
        <div className={`${chatStyles.cozeWrapper} ${styles.pane} ${chatStyles.chatPane}`}>
            <CozeAssistant
                submissionId={submissionId}
                assignment={assignment || undefined}
                rubric={rubric}
                onAnalysis={onAnalysis}
                className={chatStyles}
                provider={provider}
                setProvider={setProvider}
            />
        </div>
    );
}
