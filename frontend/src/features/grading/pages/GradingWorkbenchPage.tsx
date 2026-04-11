import GradingWorkbench from './GradingWorkbench';
import { useParams } from 'react-router-dom';

export default function GradingWorkbenchPage() {
    const { submissionId } = useParams();
    return <GradingWorkbench key={submissionId} />;
}
