/**
 * NetworkBanner
 * ──────────────
 * Global offline-notification bar that slides in from the top
 * whenever the device loses network connectivity.
 * Mount once inside <Layout /> (above <main>).
 */
import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useToast } from './hooks/useToast';
import { useI18n } from '@/shared/i18n';
import ToastContainer from './ToastContainer';
import usePrefersReducedMotion from './hooks/usePrefersReducedMotion';
import { getBannerMotion } from './motion/presets';

export default function NetworkBanner() {
    const { isOffline } = useNetworkStatus();
    const { toasts, showToast, removeToast } = useToast(3000);
    const { t } = useI18n();
    const prevOffline = useRef<boolean | null>(null);
    const prefersReducedMotion = usePrefersReducedMotion();
    const bannerMotion = getBannerMotion(prefersReducedMotion);

    // Show recovery toast exactly once when connection comes back
    useEffect(() => {
        if (prevOffline.current === null) {
            prevOffline.current = isOffline;
            return;
        }
        if (prevOffline.current && !isOffline) {
            showToast(t('network.restored'), 'success');
        }
        prevOffline.current = isOffline;
    }, [isOffline, showToast, t]);

    return (
        <>
            {/* ── Offline banner ── */}
            <AnimatePresence>
                {isOffline && (
                    <motion.div
                        key="offline-banner"
                        {...bannerMotion}
                        style={bannerStyle}
                        role="alert"
                        aria-live="assertive"
                    >
                        <i className="fas fa-wifi" style={{ opacity: 0.7, marginRight: 8 }} />
                        <span>
                            <strong>{t('network.offline.title')}</strong>
                            &nbsp;- {t('network.offline.body')}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Recovery / info toasts ── */}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
    );
}

// ── Inline styles (no extra CSS file needed) ─────────────────────────────────

const bannerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99998,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px 24px',
    background: 'linear-gradient(90deg, #b91c1c, #991b1b)',
    color: '#fff',
    fontSize: '0.9rem',
    fontWeight: 500,
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    letterSpacing: '0.02em',
};
