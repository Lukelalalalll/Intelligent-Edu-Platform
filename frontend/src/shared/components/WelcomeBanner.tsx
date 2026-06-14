import React, { useEffect, useState } from 'react';
import { useI18n } from '@/shared/i18n';
import usePrefersReducedMotion from '@/shared/hooks/usePrefersReducedMotion';

interface WelcomeBannerProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
    subtitleClassName?: string;
    style?: React.CSSProperties;
    as?: 'section' | 'header' | 'div';
    variant?: 'workspace' | 'hero';
    collapseOnScroll?: boolean;
}

function joinClassNames(parts: Array<string | undefined | false | null>): string {
    return parts.filter(Boolean).join(' ');
}

export default function WelcomeBanner({
    title,
    subtitle,
    className,
    subtitleClassName,
    style,
    as = 'section',
    variant = 'workspace',
    collapseOnScroll = false,
}: WelcomeBannerProps) {
    const Tag = as;
    const { t } = useI18n();
    const prefersReducedMotion = usePrefersReducedMotion();
    const shouldCollapse = collapseOnScroll && variant === 'workspace';
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isIntroAnimating, setIsIntroAnimating] = useState(false);

    useEffect(() => {
        if (variant !== 'workspace' || prefersReducedMotion) {
            setIsIntroAnimating(false);
            return undefined;
        }

        setIsIntroAnimating(true);

        const timeoutId = window.setTimeout(() => {
            setIsIntroAnimating(false);
        }, 560);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [prefersReducedMotion, variant]);

    useEffect(() => {
        if (!shouldCollapse || typeof window === 'undefined') {
            setIsCollapsed(false);
            return undefined;
        }

        let rafId: number | null = null;

        const syncCollapsedState = () => {
            const scrollY = window.scrollY;

            setIsCollapsed((prev) => {
                if (scrollY >= 72) {
                    return true;
                }

                if (scrollY <= 24) {
                    return false;
                }

                return prev;
            });
        };

        const scheduleSync = () => {
            if (rafId !== null) {
                return;
            }

            rafId = window.requestAnimationFrame(() => {
                rafId = null;
                syncCollapsedState();
            });
        };

        scheduleSync();
        window.addEventListener('scroll', scheduleSync, { passive: true });

        return () => {
            window.removeEventListener('scroll', scheduleSync);
            if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, [shouldCollapse]);

    return (
        <Tag
            className={joinClassNames([
                'page-header',
                `page-header--${variant}`,
                shouldCollapse && 'page-header--collapsible',
                isIntroAnimating && 'page-header--intro',
                isCollapsed && 'page-header--collapsed',
                className,
            ])}
            data-banner-collapsed={isCollapsed ? 'true' : 'false'}
            data-banner-collapsible={shouldCollapse ? 'true' : 'false'}
            data-banner-variant={variant}
            style={style}
        >
            <h1>{title || t('welcome.defaultTitle')}</h1>
            <p className={joinClassNames(['subtitle', subtitleClassName])}>
                {subtitle || t('welcome.defaultSubtitle')}
            </p>
        </Tag>
    );
}
