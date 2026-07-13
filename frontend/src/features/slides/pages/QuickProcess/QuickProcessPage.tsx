import React from 'react';
import { useNavigate } from 'react-router-dom';
import QuickProcessView from './QuickProcessView';
import { useQuickProcess } from './hooks/useQuickProcess';

export type QuickProcessPageProps = {
    bannerTitle?: React.ReactNode;
    bannerSubtitle?: string;
    missingContentRedirect?: string;
    submitLabel?: string;
    resultTitle?: string;
    proceedLabel?: string;
};

export default function QuickProcessPage({
    bannerTitle,
    bannerSubtitle,
    missingContentRedirect,
    submitLabel,
    resultTitle,
    proceedLabel,
}: QuickProcessPageProps) {
    const navigate = useNavigate();
    const { states, handlers } = useQuickProcess(navigate, { missingContentRedirect });
    return (
        <QuickProcessView
            {...states}
            {...handlers}
            bannerTitle={bannerTitle}
            bannerSubtitle={bannerSubtitle}
            submitLabel={submitLabel}
            resultTitle={resultTitle}
            proceedLabel={proceedLabel}
        />
    );
}
