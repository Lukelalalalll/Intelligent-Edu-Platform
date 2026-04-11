import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import QuestionGeneratorView from '../QuestionGenerator';
import ToastContainer from '../../../shared/ToastContainer';
import { useQuestionGenerator } from '../hooks/useQuestionGenerator';
import { chatApi } from '../../../api/chatApi';

export default function QuestionGeneratorPage() {
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
                handlers.handleFileChange({ target: { files: [file] } });
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
            <QuestionGeneratorView states={states} handlers={handlers} />
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
    );
}
