import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/ApiKeyPanel.module.css';
import client from '@/shared/api/client';

interface ApiKeyEntry {
  alias: string;
  value: string;
  provider?: string;
}

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (password: string) => void;
  hint: string;
}

/* ── Password verification modal (reused for unlock & edit) ── */
function PasswordModal({ isOpen, onClose, onVerified, hint }: PasswordModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (isOpen) { setPassword(''); setError(''); } }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        setLoading(true);
        setError('');
        try {
            await client.post('/admin/verify-password', { password });
            onVerified(password);
            setPassword('');
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setError(axiosErr.response?.data?.detail || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                className={styles.modalOverlay}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className={styles.passwordModal}
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className={styles.passwordModalHeader}>
                        <i className="fas fa-shield-alt" />
                        <h3>Admin Verification</h3>
                    </div>
                    <p className={styles.passwordModalHint}>{hint || 'Enter your admin password to continue.'}</p>
                    <form onSubmit={handleSubmit}>
                        <input
                            type="password"
                            className={styles.formInput}
                            placeholder="Admin password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoFocus
                        />
                        {error && <div className={styles.fieldError}>{error}</div>}
                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnSecondary} onClick={onClose}>Cancel</button>
                            <button type="submit" className={styles.btnPrimary} disabled={loading || !password}>
                                {loading ? 'Verifying…' : 'Verify'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default function ApiKeyPanel() {
    const [verified, setVerified] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});

    // Edit state
    const [editingAlias, setEditingAlias] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editPasswordModal, setEditPasswordModal] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');

    const fetchKeys = useCallback(async () => {
        try {
            const res = await client.get('/admin/api-keys');
            setKeys((res.data as { keys?: ApiKeyEntry[] })?.keys || []);
        } catch (err) {
            console.error('Failed to fetch API keys', err);
        }
    }, []);

    useEffect(() => {
        if (verified) fetchKeys();
    }, [verified, fetchKeys]);

    const handleVerified = () => {
        setVerified(true);
        setShowPasswordModal(false);
    };

    const toggleReveal = (alias: string) => {
        setRevealed(prev => ({ ...prev, [alias]: !prev[alias] }));
    };

    // ── Edit flow ──
    const startEdit = (alias: string) => {
        setEditingAlias(alias);
        setEditValue('');
        setEditError('');
        setEditPasswordModal(true);
    };

    const cancelEdit = () => {
        setEditingAlias(null);
        setEditValue('');
        setEditError('');
        setEditPasswordModal(false);
    };

    const handleEditPasswordVerified = (password: string) => {
        // Password verified — store it temporarily and show the edit input
        setEditPasswordModal(false);
        // stash password for the save call
        setEditValue('');
        setEditError('');
        // We store the verified password in a ref-like closure via the save handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__apiKeyEditPwd = password;
    };

    const saveEdit = async () => {
        if (!editValue.trim()) {
            setEditError('Key value cannot be empty');
            return;
        }
        setEditSaving(true);
        setEditError('');
        try {
            const res = await client.put('/admin/api-keys', {
                alias: editingAlias,
                value: editValue.trim(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                password: (window as any).__apiKeyEditPwd || '',
            });
            // Update the local key list with the new masked value
            setKeys(prev => prev.map(k =>
                k.alias === editingAlias ? { ...k, value: (res.data as { value?: string })?.value || k.value } : k
            ));
            setEditingAlias(null);
            setEditValue('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (window as any).__apiKeyEditPwd;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setEditError(axiosErr.response?.data?.detail || 'Update failed');
        } finally {
            setEditSaving(false);
        }
    };

    if (!verified) {
        return (
            <div className={styles.apiKeyPanel}>
                <div className={styles.lockedState}>
                    <i className="fas fa-lock" style={{ fontSize: 48, color: '#9ca3af', marginBottom: 16 }} />
                    <h3>API Keys are Protected</h3>
                    <p>Verify your identity to view configured API keys.</p>
                    <button className={styles.btnPrimary} onClick={() => setShowPasswordModal(true)}>
                        <i className="fas fa-key" /> Unlock
                    </button>
                </div>
                <PasswordModal
                    isOpen={showPasswordModal}
                    onClose={() => setShowPasswordModal(false)}
                    onVerified={handleVerified}
                    hint="Enter your admin password to view API keys."
                />
            </div>
        );
    }

    return (
        <div className={styles.apiKeyPanel}>
            <div className={styles.apiKeyHeader}>
                <h3><i className="fas fa-key" /> API Key Overview</h3>
                <button className={styles.btnSecondary} onClick={() => { setVerified(false); setRevealed({}); setEditingAlias(null); }}>
                    <i className="fas fa-lock" /> Lock
                </button>
            </div>
            <div className={styles.apiKeyGrid}>
                {keys.map(k => {
                    const isEditing = editingAlias === k.alias && !editPasswordModal;
                    return (
                        <div key={k.alias} className={styles.apiKeyCard}>
                            <div className={styles.apiKeyMeta}>
                                <span className={styles.apiKeyAlias}>{k.alias}</span>
                                <span className={`${styles.badge} ${styles.badgeProvider}`}>{k.provider}</span>
                            </div>

                            {isEditing ? (
                                <div className={styles.apiKeyEditRow}>
                                    <input
                                        type="text"
                                        className={styles.formInput}
                                        placeholder="Enter new key value"
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        autoFocus
                                    />
                                    {editError && <div className={styles.fieldError}>{editError}</div>}
                                    <div className={styles.apiKeyEditActions}>
                                        <button className={styles.btnPrimary} onClick={saveEdit} disabled={editSaving}>
                                            {editSaving ? 'Saving…' : 'Save'}
                                        </button>
                                        <button className={styles.btnSecondary} onClick={cancelEdit}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.apiKeyValue}>
                                    <code>{revealed[k.alias] ? k.value : '••••••••••••'}</code>
                                    <button className={styles.eyeBtn} onClick={() => toggleReveal(k.alias)} title={revealed[k.alias] ? 'Hide' : 'Show'}>
                                        <i className={`fas ${revealed[k.alias] ? 'fa-eye-slash' : 'fa-eye'}`} />
                                    </button>
                                    <button className={styles.editBtn} onClick={() => startEdit(k.alias)} title="Edit key">
                                        <i className="fas fa-pen" />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Password modal for edit verification */}
            <PasswordModal
                isOpen={editPasswordModal}
                onClose={cancelEdit}
                onVerified={handleEditPasswordVerified}
                hint={`Enter your admin password to edit ${editingAlias || 'this key'}.`}
            />
        </div>
    );
}