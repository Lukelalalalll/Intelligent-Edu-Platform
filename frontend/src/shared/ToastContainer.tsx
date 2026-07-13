import React from 'react';
import type { Toast } from '../types/api';

interface ToastContainerProps {
    toasts?: Toast[];
    onDismiss?: (id: number) => void;
}

const typeStyles: Record<Toast['type'], React.CSSProperties & { borderColor: string }> = {
    success: { background: 'var(--success-bg)', color: 'var(--success-text)', borderColor: 'rgba(34, 197, 94, 0.22)' },
    error:   { background: 'var(--danger-bg)', color: 'var(--danger-text)', borderColor: 'rgba(239, 68, 68, 0.22)' },
    info:    { background: 'var(--info-bg)', color: 'var(--info-text)', borderColor: 'rgba(59, 130, 246, 0.22)' },
    warning: { background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'rgba(245, 158, 11, 0.22)' },
};

const iconMap: Record<Toast['type'], string> = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle',
};

export default function ToastContainer({ toasts = [], onDismiss }: ToastContainerProps) {
    if (!toasts.length) return null;
    return (
        <div style={{
            position: 'fixed', top: 20, right: 20, zIndex: 99999,
            display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400,
        }}>
            {toasts.map((t) => (
                <div
                    key={t.id}
                    style={{
                        ...(typeStyles[t.type] || typeStyles.info),
                        padding: '12px 18px',
                        borderRadius: 8,
                        borderLeft: `4px solid ${(typeStyles[t.type] || typeStyles.info).borderColor}`,
                        boxShadow: 'var(--shadow-md)',
                        display: 'flex', alignItems: 'center', gap: 10,
                        animation: 'fadeInRight 0.3s ease',
                        cursor: 'pointer',
                    }}
                    onClick={() => onDismiss?.(t.id)}
                >
                    <i className={`fas ${iconMap[t.type] || iconMap.info}`} />
                    <span style={{ flex: 1, fontSize: '0.92rem' }}>{t.message}</span>
                </div>
            ))}
        </div>
    );
}
