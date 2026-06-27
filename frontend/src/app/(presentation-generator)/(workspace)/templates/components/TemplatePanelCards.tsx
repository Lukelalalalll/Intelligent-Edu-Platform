"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";

import {
    type CustomTemplates,
    useCustomTemplatePreview,
} from "@/app/hooks/useCustomTemplates";
import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { Card as TemplateCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";

import {
    CustomTemplatePreview,
    InbuiltTemplatePreview,
    LayoutsBadge,
    TemplatePreviewFallback,
    TemplatePreviewStage,
} from "../../../components/TemplatePreviewComponents";
import {
    PREVIEW_ROOT_MARGIN,
    PREVIEW_STAGGER_MS,
    getBuiltInTemplateCopy,
    scheduleAfterPaint,
} from "./templatePanelHelpers";
import styles from "./TemplatePanel.module.css";

type TemplateWorkspaceCardProps = {
    title: string;
    description: string;
    badgeLabel: string;
    onOpen: () => void;
    previewOverlay?: React.ReactNode;
    preview: React.ReactNode;
    previewReady: boolean;
    previewViewportRef?: React.Ref<HTMLDivElement>;
};

type CustomTemplateCardProps = {
    template: CustomTemplates;
    previewPriority: boolean;
    onOpen: (template: CustomTemplates) => void;
};

type BuiltInTemplateCardProps = {
    template: TemplateLayoutsWithSettings;
    previewPriority: boolean;
    onOpen: (id: string) => void;
};

function useDeferredCardPreview(previewPriority: boolean) {
    const previewViewportRef = useRef<HTMLDivElement | null>(null);
    const [shouldWarmPreview, setShouldWarmPreview] = useState(previewPriority);
    const [shouldRenderPreview, setShouldRenderPreview] = useState(false);

    useEffect(() => {
        if (previewPriority) {
            return scheduleAfterPaint(() => {
                setShouldWarmPreview(true);
            });
        }
    }, [previewPriority]);

    useEffect(() => {
        if (shouldWarmPreview) {
            return;
        }

        const element = previewViewportRef.current;
        if (!element || typeof IntersectionObserver === "undefined") {
            return scheduleAfterPaint(() => {
                setShouldWarmPreview(true);
            });
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) {
                    return;
                }

                setShouldWarmPreview(true);
                observer.disconnect();
            },
            { rootMargin: PREVIEW_ROOT_MARGIN },
        );

        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, [shouldWarmPreview]);

    useEffect(() => {
        if (!shouldWarmPreview || shouldRenderPreview) {
            return;
        }

        return scheduleAfterPaint(() => {
            setShouldRenderPreview(true);
        }, previewPriority ? 0 : PREVIEW_STAGGER_MS);
    }, [previewPriority, shouldRenderPreview, shouldWarmPreview]);

    return { previewViewportRef, shouldWarmPreview, shouldRenderPreview };
}

function TemplateWorkspaceCard({
    title,
    description,
    badgeLabel,
    onOpen,
    previewOverlay,
    preview,
    previewReady,
    previewViewportRef,
}: TemplateWorkspaceCardProps) {
    return (
        <button type="button" className={styles.templateButton} onClick={onOpen}>
            <TemplateCard className={styles.templateCardSurface}>
                <TemplatePreviewStage>
                    {previewOverlay}
                    <div
                        ref={previewViewportRef}
                        className={cn(styles.previewViewport, previewReady && styles.previewViewportReady)}
                    >
                        {previewReady ? preview : <TemplatePreviewFallback />}
                    </div>
                </TemplatePreviewStage>
                <div className={styles.templateCardBody}>
                    <div className={styles.templateCardHead}>
                        <div className={styles.templateCardCopy}>
                            <h3 className={styles.templateCardTitle}>{title}</h3>
                            <p className={styles.templateCardDescription}>{description}</p>
                        </div>
                        <ArrowUpRight className={styles.templateCardIcon} />
                    </div>
                    <span className={styles.templateTag}>{badgeLabel}</span>
                </div>
            </TemplateCard>
        </button>
    );
}

export const CustomTemplateCard = React.memo(function CustomTemplateCard({
    template,
    previewPriority,
    onOpen,
}: CustomTemplateCardProps) {
    const { t } = useI18n();
    const { previewViewportRef, shouldWarmPreview, shouldRenderPreview } = useDeferredCardPreview(previewPriority);
    const { previewLayouts, loading } = useCustomTemplatePreview(`${template.id}`, {
        enabled: shouldWarmPreview,
        limit: 2,
    });
    const handleOpen = useCallback(() => onOpen(template), [onOpen, template]);

    return (
        <TemplateWorkspaceCard
            title={template.name}
            description={t("presenton.templates.cards.customDescription")}
            badgeLabel={t("presenton.templates.cards.customBadge")}
            onOpen={handleOpen}
            previewOverlay={<LayoutsBadge count={template.layoutCount} />}
            previewReady={shouldRenderPreview}
            previewViewportRef={previewViewportRef}
            preview={(
                <CustomTemplatePreview
                    previewLayouts={previewLayouts}
                    loading={loading}
                    templateId={template.id}
                />
            )}
        />
    );
}, (prev, next) => {
    return (
        prev.template.id === next.template.id &&
        prev.template.name === next.template.name &&
        prev.template.layoutCount === next.template.layoutCount &&
        prev.previewPriority === next.previewPriority &&
        prev.onOpen === next.onOpen
    );
});

export const BuiltInTemplateCard = React.memo(function BuiltInTemplateCard({
    template,
    previewPriority,
    onOpen,
}: BuiltInTemplateCardProps) {
    const { t } = useI18n();
    const { previewViewportRef, shouldRenderPreview } = useDeferredCardPreview(previewPriority);
    const handleOpen = useCallback(() => onOpen(template.id), [onOpen, template.id]);
    const localizedTemplate = getBuiltInTemplateCopy(template, t);

    return (
        <TemplateWorkspaceCard
            title={localizedTemplate.name}
            description={localizedTemplate.description}
            badgeLabel={t("presenton.templates.cards.builtInBadge")}
            onOpen={handleOpen}
            previewOverlay={<LayoutsBadge count={template.layouts.length} />}
            previewReady={shouldRenderPreview}
            previewViewportRef={previewViewportRef}
            preview={(
                <InbuiltTemplatePreview layouts={template.layouts} templateId={template.id} />
            )}
        />
    );
});

export function BuiltInTemplatesLoadingGrid() {
    return (
        <div className={styles.templateGrid} aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
                <TemplateCard
                    key={`built-in-loading-${index}`}
                    className={cn(styles.templateCardSurface, styles.loadingTemplateSurface)}
                >
                    <TemplatePreviewStage>
                        <div className={styles.previewViewportReady}>
                            <TemplatePreviewFallback />
                        </div>
                    </TemplatePreviewStage>
                    <div className={cn(styles.templateCardBody, styles.loadingTemplateBody)}>
                        <div className={styles.loadingTextBar} />
                        <div className={cn(styles.loadingTextBar, styles.loadingTextBarWide)} />
                        <div className={styles.loadingTagPill} />
                    </div>
                </TemplateCard>
            ))}
        </div>
    );
}

export function CustomTemplatesLoadingCard() {
    const { t } = useI18n();

    return (
        <div className={styles.loadingCard}>
            <Loader2 className={cn("animate-spin", styles.loadingIcon)} />
            <p className={styles.loadingTitle}>{t("presenton.templates.cards.loading.title")}</p>
            <p className={styles.loadingText}>
                {t("presenton.templates.cards.loading.body")}
            </p>
        </div>
    );
}
