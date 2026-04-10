import React from 'react';

interface WelcomeBannerProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
    subtitleClassName?: string;
    style?: React.CSSProperties;
    as?: 'section' | 'header' | 'div';
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
}: WelcomeBannerProps) {
    const Tag = as;

    return (
        <Tag className={joinClassNames(['page-header', className])} style={style}>
            <h1>{title || 'Welcome to HKU Educational Tools Platform'}</h1>
            <p className={joinClassNames(['subtitle', subtitleClassName])}>
                {subtitle || 'Your gateway to intelligent learning and educational resources'}
            </p>
        </Tag>
    );
}
