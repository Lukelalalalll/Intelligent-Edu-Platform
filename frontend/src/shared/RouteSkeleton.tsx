import React from 'react';

type RouteSkeletonTone = 'default' | 'presenton';

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

const presentonShellStyle: React.CSSProperties = {
    minHeight: 'calc(100vh - var(--nav-height, 72px))',
    width: '100%',
    padding: '16px 0 32px',
    background:
        'radial-gradient(circle at top left, rgba(224, 245, 235, 0.98), rgba(239, 248, 243, 0.99) 34%, rgba(246, 251, 248, 1) 100%)',
};

const presentonInnerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '1520px',
    margin: '0 auto',
    padding: '0 24px',
    display: 'grid',
    gap: '16px',
    alignContent: 'start',
};

const presentonBannerStyle: React.CSSProperties = {
    borderRadius: '28px',
    padding: '32px 28px',
    background:
        'linear-gradient(135deg, rgba(0, 123, 85, 0.96) 0%, rgba(9, 97, 70, 0.94) 56%, rgba(17, 124, 90, 0.96) 100%)',
    boxShadow: '0 24px 48px -18px rgba(0, 123, 85, 0.28)',
};

const presentonNavStyle: React.CSSProperties = {
    width: 'fit-content',
    maxWidth: '100%',
    margin: '0 auto',
    padding: '12px',
    display: 'flex',
    gap: '10px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.82)',
    border: '1px solid rgba(255,255,255,0.78)',
    boxShadow: '0 18px 36px -24px rgba(15, 23, 42, 0.18)',
};

const presentonNavPillStyle: React.CSSProperties = {
    width: '116px',
    height: '42px',
    borderRadius: '999px',
    background:
        'linear-gradient(90deg, rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.2), rgba(148, 163, 184, 0.12))',
    backgroundSize: '200% 100%',
    animation: 'globalGradientFlow 1.6s ease-in-out infinite',
};

function PresentonRouteSkeleton() {
    return (
        <div style={presentonShellStyle} aria-hidden="true">
            <div style={presentonInnerStyle}>
                <div style={presentonBannerStyle}>
                    <div style={shimmer('240px', '22px')} />
                    <div style={{ height: '14px' }} />
                    <div style={shimmer('520px', '14px')} />
                </div>
                <div style={presentonNavStyle}>
                    <div style={presentonNavPillStyle} />
                    <div style={presentonNavPillStyle} />
                    <div style={presentonNavPillStyle} />
                </div>
                <div style={{ ...cardStyle, borderRadius: '24px', minHeight: '420px', padding: '24px' }}>
                    <div style={shimmer('180px', '18px')} />
                    <div style={{ height: '16px' }} />
                    <div style={shimmer('72%', '16px')} />
                    <div style={{ height: '12px' }} />
                    <div style={shimmer('54%', '16px')} />
                    <div style={{ height: '24px' }} />
                    <div
                        style={{
                            display: 'grid',
                            gap: '12px',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        }}
                    >
                        <div style={{ ...cardStyle, padding: '16px' }}>
                            <div style={shimmer('90px', '12px')} />
                            <div style={{ height: '12px' }} />
                            <div style={shimmer('72px', '20px')} />
                        </div>
                        <div style={{ ...cardStyle, padding: '16px' }}>
                            <div style={shimmer('110px', '12px')} />
                            <div style={{ height: '12px' }} />
                            <div style={shimmer('96px', '20px')} />
                        </div>
                        <div style={{ ...cardStyle, padding: '16px' }}>
                            <div style={shimmer('120px', '12px')} />
                            <div style={{ height: '12px' }} />
                            <div style={shimmer('88px', '20px')} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RouteSkeleton({ tone = 'default' }: { tone?: RouteSkeletonTone }) {
    if (tone === 'presenton') {
        return <PresentonRouteSkeleton />;
    }

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
