import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import QuestionGeneratorPage from '../../features/question-bank/QuestionGenerator';
import ToastContainer from '../../shared/ToastContainer';
import { useQuestionGenerator } from './hooks/useQuestionGenerator';
import { chatApi } from '../../api/chatApi';

export default function QuestionGeneratorEntry() {
    const { states, handlers, toasts, removeToast } = useQuestionGenerator();
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => {
        const transferId = searchParams.get('transfer_id');
        if (!transferId) return;

        let cancelled = false;
        (async () => {
            try {
                const { file } = await chatApi.transferConsumeAndDownload(transferId);
                if (cancelled) return;
                // Feed the file into the normal upload handler
                handlers.handleFileChange({ target: { files: [file] } });
                // Clean up transfer_id from URL
                searchParams.delete('transfer_id');
                setSearchParams(searchParams, { replace: true });
            } catch (err) {
                console.error('Transfer consume failed:', err);
            }
        })();

        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            <QuestionGeneratorPage states={states} handlers={handlers} />
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
    );
}
