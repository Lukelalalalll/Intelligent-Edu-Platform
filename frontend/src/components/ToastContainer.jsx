import React from 'react';

const typeStyles = {
    success: { background: '#d4edda', color: '#155724', borderColor: '#c3e6cb' },
    error:   { background: '#f8d7da', color: '#721c24', borderColor: '#f5c6cb' },
    info:    { background: '#d1ecf1', color: '#0c5460', borderColor: '#bee5eb' },
    warning: { background: '#fff3cd', color: '#856404', borderColor: '#ffeeba' },
};

const iconMap = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle',
};

export default function ToastContainer({ toasts = [], onDismiss }) {
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
                        boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
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
