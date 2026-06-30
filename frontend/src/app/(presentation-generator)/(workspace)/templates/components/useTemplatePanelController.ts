"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    type CustomTemplates,
    useCustomTemplateSummaries,
} from "@/app/hooks/useCustomTemplates";
import { usePathname, useRouter } from "@/ppt_generator/shims/next-navigation";
import { useI18n } from "@/shared/i18n";
import { PAGE_ENTRANCE_SETTLE_MS } from "@/shared/page-entrance/usePageEntrance";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

import {
    INITIAL_BUILT_IN_PREVIEW_BATCH,
    INITIAL_CUSTOM_PREVIEW_BATCH,
    buildBuiltInGroupItems,
    buildPreviewItems,
    getActiveTabDescription,
    getCustomTemplatePreviewSlug,
    getTemplatePanelStats,
    getTemplateSectionCopy,
    scheduleAfterPaint,
} from "./templatePanelHelpers";
import {
    getCachedBuiltInTemplateCatalog,
    loadBuiltInTemplateCatalog,
} from "./templateCatalogLoader";
import type { BuiltInTemplateCatalog, TemplateTab } from "./templatePanelTypes";

function useBuiltInTemplateCatalog(enabled: boolean) {
    const [catalog, setCatalog] = useState<BuiltInTemplateCatalog | null>(() => getCachedBuiltInTemplateCatalog());
    const [loading, setLoading] = useState<boolean>(() => enabled && !getCachedBuiltInTemplateCatalog());

    useEffect(() => {
        if (!enabled) {
            return scheduleAfterPaint(() => {
                setLoading(false);
            });
        }

        const cachedCatalog = getCachedBuiltInTemplateCatalog();
        if (cachedCatalog) {
            return scheduleAfterPaint(() => {
                setCatalog(cachedCatalog);
                setLoading(false);
            });
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

export function useTemplatePanelController() {
    const { t } = useI18n();
    const [tab, setTab] = useState<TemplateTab>("default");
    const [shouldLoadBuiltInCatalog, setShouldLoadBuiltInCatalog] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries();
    const { catalog: builtInCatalog, loading: builtInLoading } = useBuiltInTemplateCatalog(shouldLoadBuiltInCatalog);

    useEffect(() => {
        trackEvent(MixpanelEvent.Templates_Page_Viewed);
    }, []);

    useEffect(() => {
        if (shouldLoadBuiltInCatalog || tab !== "default" || builtInCatalog !== null) {
            return;
        }

        return scheduleAfterPaint(() => {
            setShouldLoadBuiltInCatalog(true);
        }, PAGE_ENTRANCE_SETTLE_MS);
    }, [builtInCatalog, shouldLoadBuiltInCatalog, tab]);

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

    const builtInCount = builtInCatalog?.count ?? 0;
    const customCount = customTemplates.length;
    const hasBuiltInCatalog = builtInCatalog !== null;
    const isBuiltInCatalogLoading = builtInLoading || !hasBuiltInCatalog;

    const builtInGroups = useMemo(
        () => buildBuiltInGroupItems(builtInCatalog, INITIAL_BUILT_IN_PREVIEW_BATCH),
        [builtInCatalog],
    );

    const customTemplateItems = useMemo(
        () => buildPreviewItems(customTemplates, INITIAL_CUSTOM_PREVIEW_BATCH),
        [customTemplates],
    );

    const activeTabDescription = useMemo(() => getActiveTabDescription(tab, t), [tab, t]);
    const stats = useMemo(
        () => getTemplatePanelStats({
            builtInCount,
            builtInLoading: isBuiltInCatalogLoading,
            customCount,
            customLoading,
            tab,
        }, t),
        [builtInCount, customCount, customLoading, isBuiltInCatalogLoading, t, tab],
    );
    const sectionCopy = useMemo(() => getTemplateSectionCopy(tab, t), [tab, t]);

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
                isLoading: isBuiltInCatalogLoading,
                hasCatalog: hasBuiltInCatalog,
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
