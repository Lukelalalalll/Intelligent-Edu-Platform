import React from 'react';
import SharedConfirmModal from '../../../shared/components/ConfirmModal';

interface Props {
    show?: boolean;
    setModalConfig: (config: { show: boolean; sessionId: string | null }) => void;
    confirmDelete: () => void;
}

export default function ConfirmModal({ show, setModalConfig, confirmDelete }: Props) {
    const close = () => setModalConfig({ show: false, sessionId: null });
    return (
        <SharedConfirmModal
            open={!!show}
            title="Delete Chat?"
            message="This action cannot be undone. All messages in this conversation will be permanently removed."
            confirmLabel="Delete"
            confirmDanger
            onConfirm={confirmDelete}
            onClose={close}
        />
    );
}
