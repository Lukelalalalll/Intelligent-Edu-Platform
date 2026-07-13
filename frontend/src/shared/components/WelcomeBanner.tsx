import React from 'react';
import { useI18n } from '@/shared/i18n';

interface WelcomeBannerProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
    subtitleClassName?: string;
    style?: React.CSSProperties;
    as?: 'section' | 'header' | 'div';
    variant?: 'workspace' | 'hero';
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
}: WelcomeBannerProps) {
    const Tag = as;
    const { t } = useI18n();

    return (
        <Tag
            className={joinClassNames([
                'page-header',
                `page-header--${variant}`,
                className,
            ])}
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
