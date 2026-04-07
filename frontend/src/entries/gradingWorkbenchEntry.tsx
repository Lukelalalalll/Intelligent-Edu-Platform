import GradingWorkbench from '../features/grading/pages/GradingWorkbench';
import { useParams } from 'react-router-dom';

export default function GradingWorkbenchEntry() {
    const { submissionId } = useParams();
    return <GradingWorkbench key={submissionId} />;
}
