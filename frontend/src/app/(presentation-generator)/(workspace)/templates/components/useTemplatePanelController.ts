"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    type CustomTemplates,
    useCustomTemplateSummaries,
} from "@/app/hooks/useCustomTemplates";
import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import { usePathname, useRouter } from "@/presenton/shims/next-navigation";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

import {
    buildBuiltInGroupItems,
    buildBuiltInTemplateGroups,
    buildPreviewItems,
    getActiveTabDescription,
    getCustomTemplatePreviewSlug,
    getTemplatePanelStats,
    getTemplateSectionCopy,
    INITIAL_BUILT_IN_PREVIEW_BATCH,
    INITIAL_CUSTOM_PREVIEW_BATCH,
    PREVIEW_BATCH_STEP,
    scheduleAfterPaint,
} from "./templatePanelHelpers";
import type { BuiltInTemplateCatalog, TemplateTab } from "./templatePanelTypes";

let builtInTemplateCatalogCache: BuiltInTemplateCatalog | null = null;
let builtInTemplateCatalogRequest: Promise<BuiltInTemplateCatalog> | null = null;

async function loadBuiltInTemplateCatalog(): Promise<BuiltInTemplateCatalog> {
    if (builtInTemplateCatalogCache) {
        return builtInTemplateCatalogCache;
    }

    if (!builtInTemplateCatalogRequest) {
        builtInTemplateCatalogRequest = import("@/app/presentation-templates")
            .then((module) => {
                const catalogTemplates = module.templates as TemplateLayoutsWithSettings[];
                const groups = buildBuiltInTemplateGroups(catalogTemplates);
                const catalog = {
                    templates: catalogTemplates,
                    groups,
                    count: catalogTemplates.length,
                };

                builtInTemplateCatalogCache = catalog;
                return catalog;
            })
            .finally(() => {
                builtInTemplateCatalogRequest = null;
            });
    }

    return builtInTemplateCatalogRequest;
}

function useBuiltInTemplateCatalog(enabled: boolean) {
    const [catalog, setCatalog] = useState<BuiltInTemplateCatalog | null>(() => builtInTemplateCatalogCache);
    const [loading, setLoading] = useState<boolean>(() => enabled && !builtInTemplateCatalogCache);

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        if (builtInTemplateCatalogCache) {
            setCatalog(builtInTemplateCatalogCache);
            setLoading(false);
            return;
        }

        let cancelled = false;
        let cleanup: () => void = () => {};

        cleanup = scheduleAfterPaint(() => {
            void (async () => {
                try {
                    setLoading(true);
                    const nextCatalog = await loadBuiltInTemplateCatalog();
                    if (!cancelled) {
                        setCatalog(nextCatalog);
                    }
                } finally {
                    if (!cancelled) {
                        setLoading(false);
                    }
                }
            })();
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [enabled]);

    return { catalog, loading };
}

function useProgressivePreviewBudget(
    totalCount: number,
    enabled: boolean,
    initialCount: number,
    step: number,
) {
    const [budget, setBudget] = useState(0);

    useEffect(() => {
        if (!enabled || totalCount === 0) {
            return scheduleAfterPaint(() => {
                setBudget(0);
            });
        }

        let cancelled = false;
        let current = 0;
        let cleanup: () => void = () => {};

        const advance = () => {
            if (cancelled) {
                return;
            }

            current = current === 0
                ? Math.min(initialCount, totalCount)
                : Math.min(current + step, totalCount);

            setBudget(current);

            if (current < totalCount) {
                cleanup = scheduleAfterPaint(advance, 72);
            }
        };

        cleanup = scheduleAfterPaint(() => {
            setBudget(0);
            advance();
        });

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [enabled, initialCount, step, totalCount]);

    return budget;
}

export function useTemplatePanelController() {
    const [tab, setTab] = useState<TemplateTab>("default");
    const router = useRouter();
    const pathname = usePathname();
    const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries();
    const { catalog: builtInCatalog, loading: builtInLoading } = useBuiltInTemplateCatalog(true);

    useEffect(() => {
        trackEvent(MixpanelEvent.Templates_Page_Viewed);
    }, []);

    const handleOpenBuiltInPreview = useCallback((id: string) => {
        trackEvent(MixpanelEvent.Templates_Inbuilt_Opened, { template_id: id });
        router.push(`/template-preview?slug=${id}`);
    }, [router]);

    const handleOpenCustomTemplate = useCallback((template: CustomTemplates) => {
        trackEvent(MixpanelEvent.Templates_Custom_Opened, {
            template_id: template.id,
            template_name: template.name,
        });
        router.push(`/template-preview?slug=${getCustomTemplatePreviewSlug(template.id)}`);
    }, [router]);

    const handleCreateTemplateClick = useCallback(() => {
        trackEvent(MixpanelEvent.Templates_New_Template_Clicked);
    }, []);

    const handleTabChange = useCallback((nextTab: TemplateTab) => {
        setTab((currentTab) => {
            if (currentTab === nextTab) {
                return currentTab;
            }

            trackEvent(MixpanelEvent.Templates_Tab_Switched, { tab: nextTab });
            return nextTab;
        });
    }, []);

    const builtInPreviewBudget = useProgressivePreviewBudget(
        builtInCatalog?.count ?? 0,
        tab === "default" && !builtInLoading,
        INITIAL_BUILT_IN_PREVIEW_BATCH,
        PREVIEW_BATCH_STEP,
    );

    const customPreviewBudget = useProgressivePreviewBudget(
        customTemplates.length,
        tab === "custom" && !customLoading,
        INITIAL_CUSTOM_PREVIEW_BATCH,
        2,
    );

    const builtInCount = builtInCatalog?.count ?? 0;
    const customCount = customTemplates.length;

    const builtInGroups = useMemo(
        () => buildBuiltInGroupItems(builtInCatalog, builtInPreviewBudget),
        [builtInCatalog, builtInPreviewBudget],
    );

    const customTemplateItems = useMemo(
        () => buildPreviewItems(customTemplates, customPreviewBudget),
        [customPreviewBudget, customTemplates],
    );

    const activeTabDescription = useMemo(() => getActiveTabDescription(tab), [tab]);
    const stats = useMemo(
        () => getTemplatePanelStats({
            builtInCount,
            builtInLoading,
            customCount,
            customLoading,
            tab,
        }),
        [builtInCount, builtInLoading, customCount, customLoading, tab],
    );
    const sectionCopy = useMemo(() => getTemplateSectionCopy(tab), [tab]);

    return {
        pathname,
        libraryState: {
            tab,
            activeTabDescription,
            stats,
            sectionCopy,
            builtIn: {
                count: builtInCount,
                groups: builtInGroups,
                isLoading: builtInLoading,
                hasCatalog: builtInCatalog !== null,
            },
            custom: {
                count: customCount,
                items: customTemplateItems,
                isLoading: customLoading,
            },
        },
        actions: {
            handleTabChange,
            handleCreateTemplateClick,
            handleOpenBuiltInPreview,
            handleOpenCustomTemplate,
        },
    };
}
