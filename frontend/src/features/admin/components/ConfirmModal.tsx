import React from 'react';
import SharedConfirmModal from '../../../shared/components/ConfirmModal';

interface ConfirmModalConfig {
    isOpen: boolean;
    title: string;
    text: string;
    onConfirm: (() => void) | null;
}

interface Props {
    confirmConfig: ConfirmModalConfig;
    closeConfirm: () => void;
}

export default function ConfirmModal({ confirmConfig, closeConfirm }: Props) {
    return (
        <SharedConfirmModal
            open={confirmConfig.isOpen}
            title={confirmConfig.title}
            message={confirmConfig.text}
            confirmLabel="Delete"
            confirmDanger
            onConfirm={confirmConfig.onConfirm ?? (() => {})}
            onClose={closeConfirm}
        />
    );
}
