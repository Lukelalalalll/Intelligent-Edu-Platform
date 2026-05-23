import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import client from '@/shared/api/client';
import ConfirmModal from '../../../shared/components/ConfirmModal';
import type { HistoryItem, HistoryDetail } from '../api/fileCenterHistoryApi';
import { fileCenterHistoryApi } from '../api/fileCenterHistoryApi';
import styles from '../styles/fileCenter.module.css';

interface Props {
    item: HistoryItem;
    tool: string;
    onClose: () => void;
    onDelete?: () => void;
}

const getFileUrl = (path: string) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const base = client.defaults.baseURL?.replace(/\/api$/, '') || 'http://localhost:8000';
    return `${base}/${path.replace(/^\/+/, '')}`;
};

export default function HistoryDetailModal({ item, tool, onClose, onDelete }: Props) {
    const [detail, setDetail] = useState<HistoryDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirmDelete, setConfirmDelete] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const data = await fileCenterHistoryApi.getDetail(tool, item.id);
                setDetail(data);
            } catch {
                toast.error('Failed to load details');
            } finally {
                setLoading(false);
            }
        })();
    }, [item.id, tool]);

    const formatDate = (iso: string) => {
        try { return new Date(iso).toLocaleString(); } catch { return iso; }
    };

    const handleDownload = (url: string, filename: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadRaw = () => {
        const text = typeof detail?.result === 'string' ? detail.result : JSON.stringify(detail?.result, null, 2);
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        handleDownload(url, `history_${tool}_${item.id}.md`);
        window.URL.revokeObjectURL(url);
    };

    const renderResult = () => {
        if (loading) return <p>Loading...</p>;
        if (!detail?.result) return <p style={{ color: '#94a3b8' }}>No result data available.</p>;

        let parsed: any = null;
        let isString = typeof detail.result === 'string';
        const resultStr = isString ? detail.result as string : JSON.stringify(detail.result);
        
        try { 
            parsed = isString ? JSON.parse(resultStr) : detail.result; 
        } catch { /* not JSON */ }

        // Video
        if (parsed && typeof parsed.videoPath === 'string') {
            const videoUrl = getFileUrl(parsed.videoPath);
            return (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <video src={videoUrl} controls width="640" style={{ borderRadius: 12, maxWidth: '100%', background: '#000' }} />
                </div>
            );
        }

        // SVG diagram
        if (parsed?.svg) {
            return <div dangerouslySetInnerHTML={{ __html: parsed.svg }} style={{ display: 'flex', justifyContent: 'center', padding: 20, background: '#fff', borderRadius: 8, boxShadow: 'inset 0 0 4px rgba(0,0,0,0.05)' }} />;
        }

        // Images array
        const images = parsed?.images || parsed?.ai_images;
        if (images && Array.isArray(images) && images.length > 0) {
            return (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 12,
                    padding: '8px 0'
                }}>
                    {images.map((img: string, idx: number) => (
                        <div key={idx} style={{ 
                            position: 'relative', 
                            paddingTop: '100%', 
                            borderRadius: 12, 
                            overflow: 'hidden',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                            background: '#f1f5f9'
                        }}>
                            <img 
                                src={getFileUrl(img)} 
                                alt={`Extracted ${idx+1}`} 
                                style={{
                                    position: 'absolute',
                                    top: 0, left: 0, width: '100%', height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                        </div>
                    ))}
                </div>
            );
        }

        // Otherwise ReactMarkdown if it's text
        if (isString) {
            return (
                <div style={{ fontFamily: 'inherit' }}>
                    <ReactMarkdown>{resultStr}</ReactMarkdown>
                </div>
            );
        }

        // Fallback JSON
        return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>{JSON.stringify(detail.result, null, 2)}</pre>;
    };

    const renderFooter = () => {
        let isString = typeof detail?.result === 'string';
        let parsed: any = null;
        try { parsed = isString ? JSON.parse(detail?.result as string) : detail?.result; } catch {}

        let primaryDl: React.ReactNode | null = null;
        if (parsed && typeof parsed.videoPath === 'string') {
            primaryDl = <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => handleDownload(getFileUrl(parsed.videoPath), `video_${item.id}.mp4`)}><i className="fas fa-video" /> Download Video</button>;
        } else if (parsed?.slides_url || parsed?.download_url) {
            const url = parsed.slides_url || parsed.download_url;
            primaryDl = <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => handleDownload(getFileUrl(url), `slides_${item.id}.pptx`)}><i className="fas fa-file-powerpoint" /> Download PPT</button>;
        } else if (parsed?.images || parsed?.ai_images || parsed?.svg) {
            primaryDl = <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleDownloadRaw}><i className="fas fa-code" /> Download Raw Config</button>;
        } else {
            primaryDl = <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleDownloadRaw}><i className="fas fa-download" /> Download Data</button>;
        }

        return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-color, #e2e8f0)' }}>
                {primaryDl}
                {onDelete && (
                    <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => setConfirmDelete(true)}>
                        <i className="fas fa-trash" /> Delete Record
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            <div className={styles.detailOverlay} onClick={onClose}>
                <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
                    <div className={styles.detailHeader}>
                        <span className={styles.detailTitle}>History Detail</span>
                        <button type="button" className={`${styles.btn} ${styles.btnSmall}`} onClick={onClose} style={{ boxShadow: 'none' }}>
                            <i className="fas fa-times" /> Close
                        </button>
                    </div>

                    <div className={styles.detailMeta}>
                        <span className={styles.metaLabel}>Tool</span>
                        <span className={styles.metaValue} style={{ textTransform: 'capitalize' }}>{tool.replace('_', ' ')}</span>

                        <span className={styles.metaLabel}>Created</span>
                        <span className={styles.metaValue}>{formatDate(item.created_at)}</span>

                        {item.params && Object.entries(item.params).map(([k, v]) => (
                            <React.Fragment key={k}>
                                <span className={styles.metaLabel} style={{ textTransform: 'capitalize' }}>{k.replace('_', ' ')}</span>
                                <span className={styles.metaValue}>{String(v ?? '')}</span>
                            </React.Fragment>
                        ))}
                    </div>

                    <div className={styles.detailContent} style={{ 
                        maxHeight: '45vh', 
                        overflowY: 'auto',
                        background: '#f8fafc',
                        padding: 16,
                        borderRadius: 10
                    }}>
                        {renderResult()}
                    </div>

                    {renderFooter()}
                </div>
            </div>

            <ConfirmModal 
                open={confirmDelete}
                title="Delete Record"
                message="Are you sure you want to delete this history record? This cannot be undone."
                confirmLabel="Delete"
                confirmDanger={true}
                onClose={() => setConfirmDelete(false)}
                onConfirm={() => {
                    setConfirmDelete(false);
                    if (onDelete) onDelete();
                }}
            />
        </>
    );
}
