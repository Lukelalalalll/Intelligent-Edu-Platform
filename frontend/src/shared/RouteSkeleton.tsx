import React from 'react';

const shellStyle: React.CSSProperties = {
    minHeight: 'calc(100vh - var(--nav-height, 72px))',
    padding: '24px',
    display: 'grid',
    gap: '16px',
    alignContent: 'start',
};

const cardStyle: React.CSSProperties = {
    borderRadius: '16px',
    background: 'var(--surface-raised)',
    border: '1px solid var(--line-soft)',
    boxShadow: 'var(--shadow-sm)',
};

function shimmer(width: string, height: string): React.CSSProperties {
    return {
        width,
        height,
        borderRadius: '999px',
        background: 'linear-gradient(90deg, rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.22), rgba(148, 163, 184, 0.12))',
        backgroundSize: '200% 100%',
        animation: 'globalGradientFlow 1.6s ease-in-out infinite',
    };
}

export default function RouteSkeleton() {
    return (
        <div style={shellStyle} aria-hidden="true">
            <div style={{ ...cardStyle, padding: '24px' }}>
                <div style={shimmer('220px', '20px')} />
                <div style={{ height: '10px' }} />
                <div style={shimmer('420px', '12px')} />
            </div>
            <div style={{ ...cardStyle, minHeight: '360px', padding: '20px' }}>
                <div style={shimmer('100%', '14px')} />
                <div style={{ height: '12px' }} />
                <div style={shimmer('86%', '14px')} />
                <div style={{ height: '12px' }} />
                <div style={shimmer('92%', '14px')} />
            </div>
        </div>
    );
}
