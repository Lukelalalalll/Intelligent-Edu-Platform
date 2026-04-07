import React from 'react';
import QuestionGeneratorPage from '../../features/question-bank/QuestionGenerator';
import ToastContainer from '../../shared/ToastContainer';
import { useQuestionGenerator } from './hooks/useQuestionGenerator';

export default function QuestionGeneratorEntry() {
    const { states, handlers, toasts, removeToast } = useQuestionGenerator();
    return (
        <>
            <QuestionGeneratorPage states={states} handlers={handlers} />
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
    );
}
