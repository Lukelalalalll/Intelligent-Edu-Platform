// frontend/src/features/chat/components/TransferModal.tsx

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../../api/chatApi';
import type { ChatMessage } from '../types';
import styles from '../styles/Chat.module.css';

interface Props {
    message: ChatMessage;
    roomId: string;
    onClose: () => void;
}

const MODULE_OPTIONS = [
    { value: 'sub1', label: 'Slides (MD Processor)', icon: 'fa-file-powerpoint', exts: 'PDF, MD', group: '' },
    { value: 'sub2', label: 'Question Generator', icon: 'fa-question-circle', exts: 'PDF, PNG, JPG', group: '' },
    { value: 'sub3', label: 'Image Extractor', icon: 'fa-images', exts: 'PDF', group: '' },
    { value: 'sub4_extract', label: 'Extract Diagram', icon: 'fa-project-diagram', exts: 'PDF, DOCX', group: 'Visual Tool' },
    { value: 'sub4_images', label: 'Image Extract', icon: 'fa-file-image', exts: 'PDF', group: 'Visual Tool' },
    { value: 'sub5', label: 'Study Notes', icon: 'fa-sticky-note', exts: 'PDF', group: '' },
];

const STYLE_OPTIONS = [
    { value: 'detailed', label: 'Detailed' },
    { value: 'concise', label: 'Concise' },
    { value: 'exam', label: 'Exam Focus' },
];

export default function TransferModal({ message, roomId, onClose }: Props) {
    const navigate = useNavigate();
    const [selectedModule, setSelectedModule] = useState<string>('');
    const [style, setStyle] = useState('detailed');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileExt = (message.fileName || '').split('.').pop()?.toLowerCase() || '';

    const isModuleCompatible = (mod: string): boolean => {
        const extMap: Record<string, string[]> = {
            sub1: ['pdf', 'md'],
            sub2: ['pdf', 'png', 'jpg', 'jpeg'],
            sub3: ['pdf'],
            sub4_extract: ['pdf', 'docx', 'doc'],
            sub4_images: ['pdf'],
            sub5: ['pdf'],
        };
        return (extMap[mod] || []).includes(fileExt);
    };

    const handleTransfer = useCallback(async () => {
        if (!selectedModule) return;
        setLoading(true);
        setError(null);
        try {
            const opts: Record<string, unknown> = {};
            if (selectedModule === 'sub5') {
                opts.style = style;
            }

            // Map sub4 sub-entries back to 'sub4' for the backend
            const backendModule = selectedModule.startsWith('sub4') ? 'sub4' : selectedModule;

            const res = await chatApi.transferStart(roomId, message.id, backendModule, opts);
            onClose();

            // For sub4 sub-entries, add tab param to the redirect
            if (selectedModule.startsWith('sub4_')) {
                const tabMap: Record<string, string> = {
                    sub4_extract: 'extract',
                    sub4_images: 'images',
                };
                const tab = tabMap[selectedModule] || 'extract';
                navigate(`/diagram?transfer_id=${res.transfer_id}&tab=${tab}`);
            } else {
                navigate(res.redirect_url);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Transfer failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [selectedModule, style, roomId, message.id, navigate, onClose]);

    return (
        <div className={styles.transferModalOverlay} onClick={onClose}>
            <div className={styles.transferModal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.transferModalHeader}>
                    <i className="fas fa-exchange-alt" style={{ marginRight: 8 }} />
                    <span>Send to Module</span>
                    <button className={styles.transferModalClose} onClick={onClose}>
                        <i className="fas fa-times" />
                    </button>
                </div>

                <div className={styles.transferModalBody}>
                    <div className={styles.transferFileInfo}>
                        <i className="fas fa-file" style={{ marginRight: 8, opacity: 0.6 }} />
                        <span>{message.fileName || 'Unknown file'}</span>
                        <span className={styles.transferFileExt}>.{fileExt}</span>
                    </div>

                    <div className={styles.transferModuleGrid}>
                        {MODULE_OPTIONS.map((mod, idx) => {
                            const compatible = isModuleCompatible(mod.value);
                            const prevGroup = idx > 0 ? MODULE_OPTIONS[idx - 1].group : '';
                            const showGroupLabel = mod.group && mod.group !== prevGroup;
                            return (
                                <React.Fragment key={mod.value}>
                                    {showGroupLabel && (
                                        <div className={styles.transferGroupLabel}>{mod.group}</div>
                                    )}
                                    <button
                                        className={`${styles.transferModuleCard} ${selectedModule === mod.value ? styles.transferModuleCardActive : ''} ${!compatible ? styles.transferModuleCardDisabled : ''}`}
                                        onClick={() => compatible && setSelectedModule(mod.value)}
                                        disabled={!compatible}
                                        title={compatible ? mod.label : `File type .${fileExt} not supported`}
                                    >
                                        <i className={`fas ${mod.icon}`} />
                                        <span className={styles.transferModuleName}>{mod.label}</span>
                                        <span className={styles.transferModuleExts}>{mod.exts}</span>
                                    </button>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Sub5 style selector */}
                    {selectedModule === 'sub5' && (
                        <div className={styles.transferOptions}>
                            <label className={styles.transferOptionsLabel}>Note Style:</label>
                            <div className={styles.transferOptionsBtns}>
                                {STYLE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        className={`${styles.assistantBtn} ${style === opt.value ? styles.assistantBtnActive : ''}`}
                                        onClick={() => setStyle(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className={styles.assistantError} style={{ marginTop: 12 }}>
                            <i className="fas fa-exclamation-triangle" /> {error}
                        </div>
                    )}
                </div>

                <div className={styles.transferModalFooter}>
                    <button className={styles.transferCancelBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className={styles.transferConfirmBtn}
                        onClick={handleTransfer}
                        disabled={!selectedModule || loading}
                    >
                        {loading
                            ? <><i className="fas fa-circle-notch fa-spin" /> Sending...</>
                            : <><i className="fas fa-paper-plane" /> Send</>}
                    </button>
                </div>
            </div>
        </div>
    );
}
