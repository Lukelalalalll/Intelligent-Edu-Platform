import ToastContainer from '@/shared/ToastContainer';

import QuestionGeneratorView from '../components/QuestionGeneratorView';
import { useQuestionGenerator } from '../hooks/useQuestionGenerator';

export default function QuestionGeneratorPage() {
    const controller = useQuestionGenerator();

    return (
        <>
            <QuestionGeneratorView controller={controller} />
            <ToastContainer toasts={controller.toasts} onDismiss={controller.removeToast} />
        </>
    );
}
