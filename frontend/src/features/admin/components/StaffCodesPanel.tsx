import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/AdminDashboard.module.css';
import client from '@/shared/api/client';

interface StaffCode {
    code: string;
    is_used: boolean;
    created_at: string;
    expires_at: string;
    used_by: string | null;
    used_at: string | null;
}

export default function StaffCodesPanel({ openConfirm }: { openConfirm?: (title: string, text: string, onConfirm: () => void) => void }) {
    const [codes, setCodes] = useState<StaffCode[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [error, setError] = useState('');

    const fetchCodes = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await client.get('/admin/staff-codes');
            setCodes(res.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to load staff codes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCodes(); }, [fetchCodes]);

    const handleGenerate = async () => {
        setGenerating(true);
        setError('');
        try {
            const res = await client.post('/admin/staff-codes/generate');
            await fetchCodes();
            handleCopy(res.data.code);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to generate code');
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async (code: string) => {
        const revokeAction = async () => {
            try {
                await client.delete(`/admin/staff-codes/${code}`);
                setCodes(prev => prev.filter(c => c.code !== code));
            } catch (err: any) {
                setError(err.response?.data?.detail || 'Failed to revoke code');
            }
        };

        if (openConfirm) {
            openConfirm(
                'Revoke Staff Code',
                `Are you sure you want to revoke the staff code "${code}"? Action cannot be undone.`,
                revokeAction
            );
        } else {
            if (window.confirm(`Revoke staff code ${code}?`)) revokeAction();
        }
    };

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(code).catch(() => {});
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const isExpired = (expires_at: string) => new Date(expires_at) < new Date();

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>Staff Registration Codes</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
                        Generate one-time codes for university staff to register as teachers.
                    </p>
                </div>
                <button
                    className={styles.btnPrimary}
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px', justifyContent: 'center' }}
                >
                    {generating
                        ? <><i className="fas fa-circle-notch fa-spin"></i> Generating…</>
                        : <><i className="fas fa-plus"></i> Generate Code</>}
                </button>
            </div>

            {error && (
                <div className={styles.fieldError} style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.07)' }}>
                    <i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i>{error}
                </div>
            )}

            {/* Copied toast */}
            <AnimatePresence>
                {copiedCode && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
                        style={{
                            position: 'fixed', bottom: '32px', right: '32px', zIndex: 9999,
                            background: '#007B55', color: '#fff', borderRadius: '10px',
                            padding: '12px 20px', fontSize: '14px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            display: 'flex', alignItems: 'center', gap: '8px',
                        }}
                    >
                        <i className="fas fa-check-circle" style={{ fontSize: '16px' }}></i>
                        Copied: <strong style={{ fontFamily: 'monospace', letterSpacing: '1.5px', fontSize: '15px' }}>{copiedCode}</strong>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '24px' }}></i>
                </div>
            ) : codes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '14px' }}>
                    <i className="fas fa-ticket-alt" style={{ fontSize: '36px', marginBottom: '12px', display: 'block' }}></i>
                    No staff codes yet. Generate one to get started.
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                                {['Code', 'Status', 'Created', 'Expires', 'Used By', 'Actions'].map(h => (
                                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {codes.map(c => (
                                <motion.tr
                                    key={c.code}
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    style={{ borderBottom: '1px solid #f3f4f6' }}
                                >
                                    <td style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1.5px', color: '#1f2937' }}>{c.code}</span>
                                            <button
                                                onClick={() => handleCopy(c.code)}
                                                title="Copy to clipboard"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px 4px', borderRadius: '4px' }}
                                            >
                                                <i className={`fas ${copiedCode === c.code ? 'fa-check' : 'fa-copy'}`}></i>
                                            </button>
                                        </div>
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        {c.is_used ? (
                                            <span style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: '20px', padding: '2px 10px', fontWeight: 500 }}>Used</span>
                                        ) : isExpired(c.expires_at) ? (
                                            <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '20px', padding: '2px 10px', fontWeight: 500 }}>Expired</span>
                                        ) : (
                                            <span style={{ background: 'rgba(0,123,85,0.1)', color: '#007B55', borderRadius: '20px', padding: '2px 10px', fontWeight: 500 }}>Active</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                                    <td style={{ padding: '10px 12px', color: isExpired(c.expires_at) ? '#ef4444' : '#6b7280', whiteSpace: 'nowrap' }}>{new Date(c.expires_at).toLocaleDateString()}</td>
                                    <td style={{ padding: '10px 12px', color: '#6b7280', fontFamily: c.used_by ? 'monospace' : 'inherit', fontSize: c.used_by ? '12px' : 'inherit' }}>
                                        {c.used_by ? c.used_by.slice(0, 10) + '…' : '—'}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        {!c.is_used && !isExpired(c.expires_at) && (
                                            <button
                                                onClick={() => handleRevoke(c.code)}
                                                title="Revoke this code"
                                                style={{
                                                    background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                                                    color: '#ef4444', borderRadius: '6px', padding: '4px 10px',
                                                    cursor: 'pointer', fontSize: '12px',
                                                }}
                                            >
                                                <i className="fas fa-trash-alt" style={{ marginRight: '4px' }}></i>Revoke
                                            </button>
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
