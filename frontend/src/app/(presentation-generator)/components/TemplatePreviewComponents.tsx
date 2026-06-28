"use client";
import React, { memo, useMemo } from "react";

import { cn } from "@/lib/utils";
import type { TemplateWithData } from "@/app/presentation-templates/utils";
import type { CompiledLayout } from "@/app/hooks/compileLayout";

export function TemplatePreviewStage({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="relative h-[230px] overflow-hidden px-5 pb-5 pt-5"
            style={{
                backgroundImage: "url('/card_bg.svg')",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundSize: "cover",
                contain: "layout paint style",
            }}
        >
            {children}
        </div>
    );
}

export const LayoutsBadge = memo(function LayoutsBadge({
    count,
    className,
}: {
    count: number;
    className?: string;
}) {
    return (
        <span className={cn("text-xs absolute top-3.5 left-4 z-40 inline-flex items-center rounded-full bg-[#333333] px-3 py-1 font-semibold text-white", className)}>
            Layouts-{count}
        </span>
    );
});

export const ScaledSlidePreview = memo(function ScaledSlidePreview({
    children,
    id,
    index,
    isOutline = false,
}: {
    children: React.ReactNode;
    id: string;
    index: number;
    isOutline?: boolean;
}) {
    const PREVIEW_SCALE = isOutline ? 0.2 : 0.24;
    const SLIDE_HEIGHT = 720 * PREVIEW_SCALE;
    const SLIDE_WIDTH = 1280;
    const SLIDE_NATIVE_HEIGHT = 720;
    return (
        <div
            key={`${id}-preview-${index}`}
            className="relative"
            style={{ height: `${SLIDE_HEIGHT}px`, overflow: "hidden", contain: "layout paint style" }}
        >
            <div
                className={`absolute top-0 ${isOutline ? "left-0" : "left-8"} pointer-events-none`}
                style={{
                    width: SLIDE_WIDTH,
                    height: SLIDE_NATIVE_HEIGHT,
                    transformOrigin: "top left",
                    transform: `scale(${PREVIEW_SCALE})`,
                }}
            >
                {children}
            </div>
        </div>
    );
});

export const InbuiltTemplatePreview = memo(function InbuiltTemplatePreview({
    layouts,
    templateId,
    isOutline = false,
}: {
    layouts: TemplateWithData[];
    templateId: string;
    isOutline?: boolean;
}) {
    const previewLayouts = useMemo(() => layouts.slice(0, 2), [layouts]);
    return (
        <div className="relative z-10 flex flex-col gap-3 overflow-hidden">
            {previewLayouts.map((layout, index) => {
                const LayoutComponent = layout.component;
                return (
                    <ScaledSlidePreview key={`${templateId}-preview-${index}`} id={templateId} index={index} isOutline={isOutline}>
                        <LayoutComponent data={layout.sampleData} />
                    </ScaledSlidePreview>
                );
            })}
        </div>
    );
});

export const TemplatePreviewFallback = memo(function TemplatePreviewFallback({
    slideCount = 2,
}: {
    slideCount?: number;
}) {
    return (
        <div className="relative z-10 flex flex-col gap-3 overflow-hidden" aria-hidden="true">
            {Array.from({ length: slideCount }).map((_, index) => (
                <div
                    key={`preview-fallback-${index}`}
                    className="relative overflow-hidden rounded-[14px] border border-white/80"
                    style={{
                        height: `${720 * 0.24}px`,
                        contain: "layout paint style",
                        backgroundColor: "rgba(255, 255, 255, 0.72)",
                        boxShadow: "0 14px 28px -24px rgba(15, 23, 42, 0.24)",
                    }}
                >
                    <div
                        className="absolute inset-0"
                        style={{
                            background: "linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(241, 245, 249, 0.92))",
                        }}
                    />
                    <div className="absolute left-4 right-12 top-4 h-3 rounded-full" style={{ backgroundColor: "rgba(148, 163, 184, 0.18)" }} />
                    <div className="absolute left-4 right-20 top-10 h-3 rounded-full" style={{ backgroundColor: "rgba(148, 163, 184, 0.12)" }} />
                    <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-3">
                        <span className="h-16 rounded-[12px]" style={{ backgroundColor: "rgba(226, 232, 240, 0.62)" }} />
                        <span className="h-16 rounded-[12px]" style={{ backgroundColor: "rgba(226, 232, 240, 0.52)" }} />
                        <span className="h-16 rounded-[12px]" style={{ backgroundColor: "rgba(226, 232, 240, 0.58)" }} />
                    </div>
                </div>
            ))}
        </div>
    );
});

export const CustomTemplatePreview = memo(function CustomTemplatePreview({
    previewLayouts,
    loading,
    templateId,
    isOutline = false,
}: {
    previewLayouts: CompiledLayout[];
    loading: boolean;
    templateId: string;
    isOutline?: boolean;
}) {
    const visibleLayouts = useMemo(() => previewLayouts.slice(0, 2), [previewLayouts]);

    if (loading || visibleLayouts.length === 0) {
        return <TemplatePreviewFallback />;
    }

    return (
        <div className="relative z-10 flex flex-col gap-3">
            {visibleLayouts.map((layout, index) => {
                const LayoutComponent = layout.component;
                return (
                    <ScaledSlidePreview key={`${templateId}-preview-${index}`} id={templateId} index={index} isOutline={isOutline}>
                        <LayoutComponent data={layout.sampleData} />
                    </ScaledSlidePreview>
                );
            })}
        </div>
    );
});

