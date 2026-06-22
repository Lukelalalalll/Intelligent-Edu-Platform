"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/presenton/shims/next-link";
import { usePathname, useRouter } from "@/presenton/shims/next-navigation";
import {
    ArrowUpRight,
    ChevronRight,
    LayoutDashboard,
    Loader2,
    Palette,
    PanelTop,
    Sparkles,
} from "lucide-react";

import { Card as TemplateCard } from "@/components/ui/card";
import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import {
    useCustomTemplateSummaries,
    useCustomTemplatePreview,
    CustomTemplates,
} from "@/app/hooks/useCustomTemplates";
import CreateCustomTemplate from "./CreateCustomTemplate";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { cn } from "@/lib/utils";
import WorkspaceCard from "@/shared/components/Card/Card";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import {
    TemplatePreviewStage,
    LayoutsBadge,
    InbuiltTemplatePreview,
    CustomTemplatePreview,
    TemplatePreviewFallback,
} from "../../../components/TemplatePreviewComponents";
import styles from "./TemplatePanel.module.css";

type TemplateTab = "custom" | "default";

type BuiltInTemplateGroup = {
    key: string;
    title: string;
    description: string;
    templates: TemplateLayoutsWithSettings[];
};

type BuiltInTemplateCatalog = {
    templates: TemplateLayoutsWithSettings[];
    groups: BuiltInTemplateGroup[];
    count: number;
};

const INITIAL_BUILT_IN_PREVIEW_BATCH = 4;
const INITIAL_CUSTOM_PREVIEW_BATCH = 2;
const PREVIEW_BATCH_STEP = 4;
const PREVIEW_ROOT_MARGIN = "280px";
const PREVIEW_STAGGER_MS = 28;

const TemplateNavIcon = ({ active }: { active: boolean }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "#007b55" : "#667085"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.navIcon}
        aria-hidden="true"
    >
        <path d="M4 14h6" />
        <path d="M4 2h10" />
        <rect x="4" y="18" width="16" height="4" rx="1" />
        <rect x="4" y="6" width="16" height="4" rx="1" />
    </svg>
);

const presentonNavItems = [
    {
        href: "/dashboard",
        label: "Dashboard",
        renderIcon: (active: boolean) => (
            <LayoutDashboard className={styles.navIcon} color={active ? "#007b55" : "#667085"} />
        ),
    },
    {
        href: "/templates",
        label: "Templates",
        renderIcon: (active: boolean) => <TemplateNavIcon active={active} />,
    },
    {
        href: "/theme",
        label: "Themes",
        renderIcon: (active: boolean) => (
            <Palette className={styles.navIcon} color={active ? "#007b55" : "#667085"} />
        ),
    },
] as const;

let builtInTemplateCatalogCache: BuiltInTemplateCatalog | null = null;
let builtInTemplateCatalogRequest: Promise<BuiltInTemplateCatalog> | null = null;

function buildBuiltInTemplateGroups(sourceTemplates: TemplateLayoutsWithSettings[]): BuiltInTemplateGroup[] {
    const nonNeo: TemplateLayoutsWithSettings[] = [];
    const neo: TemplateLayoutsWithSettings[] = [];

    for (const template of sourceTemplates) {
        if (template.id.startsWith("neo")) {
            neo.push(template);
        } else {
            nonNeo.push(template);
        }
    }

    return [
        {
            key: "core",
            title: "Core families",
            description: "General-purpose and domain-ready starting points for business, education, product, and report decks.",
            templates: nonNeo,
        },
        {
            key: "neo",
            title: "Neo families",
            description: "Newer Presenton layout systems with broader coverage for longer-form decks and refreshed pacing.",
            templates: neo,
        },
    ].filter((group) => group.templates.length > 0);
}

function scheduleAfterPaint(callback: () => void, delayMs = 0) {
    if (typeof window === "undefined") {
        callback();
        return () => undefined;
    }

    const idleWindow = window as Window & {
        requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
    };

    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;
    let timeoutId: number | null = null;
    let idleCallbackId: number | null = null;

    const queueCallback = () => {
        timeoutId = window.setTimeout(() => {
            callback();
        }, delayMs);
    };

    firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(() => {
            if (typeof idleWindow.requestIdleCallback === "function") {
                idleCallbackId = idleWindow.requestIdleCallback(queueCallback, { timeout: 260 });
                return;
            }
            queueCallback();
        });
    });

    return () => {
        if (firstFrameId !== null) {
            window.cancelAnimationFrame(firstFrameId);
        }
        if (secondFrameId !== null) {
            window.cancelAnimationFrame(secondFrameId);
        }
        if (idleCallbackId !== null && typeof idleWindow.cancelIdleCallback === "function") {
            idleWindow.cancelIdleCallback(idleCallbackId);
        }
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
    };
}

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

        const cleanup = scheduleAfterPaint(() => {
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
            setBudget(0);
            return;
        }

        let cancelled = false;
        let current = 0;
        let cleanup = () => undefined;

        setBudget(0);

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

        cleanup = scheduleAfterPaint(advance);

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [enabled, initialCount, step, totalCount]);

    return budget;
}

function useDeferredCardPreview(previewPriority: boolean) {
    const previewViewportRef = useRef<HTMLDivElement | null>(null);
    const [shouldWarmPreview, setShouldWarmPreview] = useState(previewPriority);
    const [shouldRenderPreview, setShouldRenderPreview] = useState(false);

    useEffect(() => {
        if (previewPriority) {
            setShouldWarmPreview(true);
        }
    }, [previewPriority]);

    useEffect(() => {
        if (shouldWarmPreview) {
            return;
        }

        const element = previewViewportRef.current;
        if (!element || typeof IntersectionObserver === "undefined") {
            setShouldWarmPreview(true);
            return;
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
}: {
    template: CustomTemplates;
    previewPriority: boolean;
}) {
    const router = useRouter();
    const { previewViewportRef, shouldWarmPreview, shouldRenderPreview } = useDeferredCardPreview(previewPriority);
    const { previewLayouts, loading } = useCustomTemplatePreview(`${template.id}`, {
        enabled: shouldWarmPreview,
        limit: 2,
    });

    const handleOpen = useCallback(() => {
        trackEvent(MixpanelEvent.Templates_Custom_Opened, { template_id: template.id, template_name: template.name });
        if (template.id.startsWith("custom-")) {
            router.push(`/template-preview?slug=${template.id}`);
        } else {
            router.push(`/template-preview?slug=custom-${template.id}`);
        }
    }, [router, template.id, template.name]);

    return (
        <TemplateWorkspaceCard
            title={template.name}
            description="Open this custom template in preview and keep refining its reusable layout set."
            badgeLabel="Custom template"
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
        prev.previewPriority === next.previewPriority
    );
});

const InbuiltTemplateCard = React.memo(function InbuiltTemplateCard({
    template,
    onOpen,
    previewPriority,
}: {
    template: TemplateLayoutsWithSettings;
    onOpen: (id: string) => void;
    previewPriority: boolean;
}) {
    const { previewViewportRef, shouldRenderPreview } = useDeferredCardPreview(previewPriority);
    const handleOpen = useCallback(() => onOpen(template.id), [onOpen, template.id]);

    return (
        <TemplateWorkspaceCard
            title={template.name}
            description={template.description}
            badgeLabel="Built-in family"
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

function BuiltInTemplatesLoadingGrid() {
    return (
        <div className={styles.templateGrid} aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => (
                <TemplateCard key={`built-in-loading-${index}`} className={cn(styles.templateCardSurface, styles.loadingTemplateSurface)}>
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

const LayoutPreview = () => {
    const [tab, setTab] = useState<TemplateTab>("default");
    const router = useRouter();
    const pathname = usePathname();
    const { templates: customTemplates, loading: customLoading } = useCustomTemplateSummaries();
    const { catalog: builtInCatalog, loading: builtInLoading } = useBuiltInTemplateCatalog(true);

    useEffect(() => {
        trackEvent(MixpanelEvent.Templates_Page_Viewed);
    }, []);

    const handleOpenPreview = useCallback((id: string) => {
        trackEvent(MixpanelEvent.Templates_Inbuilt_Opened, { template_id: id });
        router.push(`/template-preview?slug=${id}`);
    }, [router]);

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

    const builtInGroups = useMemo(() => {
        let previewIndex = 0;
        return (builtInCatalog?.groups ?? []).map((group) => ({
            ...group,
            items: group.templates.map((template) => {
                const item = {
                    template,
                    previewPriority: previewIndex < builtInPreviewBudget,
                };
                previewIndex += 1;
                return item;
            }),
        }));
    }, [builtInCatalog, builtInPreviewBudget]);

    const customTemplateItems = useMemo(
        () => customTemplates.map((template, index) => ({
            template,
            previewPriority: index < customPreviewBudget,
        })),
        [customPreviewBudget, customTemplates],
    );

    const activeTabDescription = tab === "default"
        ? "Browse built-in template families grouped by Presenton style system, then jump into preview when one feels right."
        : "Open a saved custom template or start a new reusable layout set without leaving the workspace.";

    const handleTabChange = useCallback((nextTab: TemplateTab) => {
        if (nextTab === tab) return;
        trackEvent(MixpanelEvent.Templates_Tab_Switched, { tab: nextTab });
        setTab(nextTab);
    }, [tab]);

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <WelcomeBanner
                    title="Templates"
                    subtitle="Browse built-in families, reopen custom work, and move into preview from a calmer Presenton workspace."
                    variant="workspace"
                    className={styles.banner}
                />

                <div className={styles.navShell}>
                    <nav className={styles.navList} aria-label="Presenton workspace navigation">
                        {presentonNavItems.map(({ href, label, renderIcon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={isActive ? "page" : undefined}
                                    className={cn(styles.navItem, isActive && styles.navItemActive)}
                                >
                                    {renderIcon(isActive)}
                                    <span>{label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <WorkspaceCard className={cn(styles.surfaceCard, styles.motionCard, styles.motionPrimary)}>
                    <div className={styles.controlSection}>
                        <div className={styles.controlTop}>
                            <div className={styles.controlCopy}>
                                <div className={styles.badge}>
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Presenton workspace
                                </div>
                                <h2 className={styles.controlTitle}>Pick the starting point that fits the deck you want next.</h2>
                                <p className={styles.controlDescription}>
                                    Built-in families stay grouped by Presenton layout system, while custom templates remain ready to reopen anywhere your deck workflow continues.
                                </p>
                            </div>

                            <div className={styles.controlActions}>
                                <Link
                                    href="/custom-template"
                                    onClick={() => trackEvent(MixpanelEvent.Templates_New_Template_Clicked)}
                                    className={styles.primaryAction}
                                    aria-label="Create new template"
                                >
                                    <span>New Template</span>
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                                <p className={styles.controlHelper}>
                                    The template browser stays focused on choosing, previewing, and reopening layouts without changing any backend behavior or preview routes.
                                </p>
                            </div>
                        </div>

                        <div className={styles.controlBottom}>
                            <div className={styles.tabBlock}>
                                <div className={styles.tabRail} role="tablist" aria-label="Template library views">
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === "default"}
                                        className={cn(styles.tabButton, tab === "default" && styles.tabButtonActive)}
                                        onClick={() => handleTabChange("default")}
                                    >
                                        Built-in
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === "custom"}
                                        className={cn(styles.tabButton, tab === "custom" && styles.tabButtonActive)}
                                        onClick={() => handleTabChange("custom")}
                                    >
                                        Custom
                                    </button>
                                </div>
                                <p className={styles.activeTabNote}>{activeTabDescription}</p>
                            </div>

                                <div className={styles.statsGrid}>
                                    <div className={styles.statCard}>
                                        <span className={styles.statLabel}>Built-in families</span>
                                        <div className={styles.statValue}>{builtInLoading ? "..." : (builtInCatalog?.count ?? 0)}</div>
                                        <p className={styles.statMeta}>Ready to preview from the shared Presenton library.</p>
                                    </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statLabel}>Custom templates</span>
                                    <div className={styles.statValue}>{customLoading ? "..." : customTemplates.length}</div>
                                    <p className={styles.statMeta}>
                                        {customLoading
                                            ? "Loading saved custom templates."
                                            : customTemplates.length === 1
                                                ? "Saved custom template available."
                                                : "Saved custom templates available."}
                                    </p>
                                </div>
                                <div className={styles.statCard}>
                                    <span className={styles.statLabel}>Active view</span>
                                    <div className={styles.statValue}>{tab === "default" ? "Built-in" : "Custom"}</div>
                                    <p className={styles.statMeta}>
                                        {tab === "default" ? "Grouped by Presenton style family." : "Create or reopen reusable custom layouts."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </WorkspaceCard>

                <WorkspaceCard className={cn(styles.surfaceCard, styles.motionCard, styles.motionSecondary)}>
                    <div className={styles.contentSection}>
                        <div className={styles.sectionIntro}>
                            <div className={styles.sectionTitleWrap}>
                                <div className={cn(styles.badge, styles.mutedBadge)}>
                                    <PanelTop className="h-3.5 w-3.5" />
                                    {tab === "default" ? "Built-in library" : "Custom library"}
                                </div>
                                <h2 className={styles.sectionTitle}>
                                    {tab === "default"
                                        ? "Browse template families and jump straight into preview."
                                        : "Keep reusable layouts within reach for the next deck."}
                                </h2>
                                <p className={styles.sectionDescription}>
                                    {tab === "default"
                                        ? "Choose a template family first, then open preview to inspect the layouts, pacing, and deck style before generation starts."
                                        : "Create a fresh template or reopen a saved custom layout set without leaving the Presenton workspace."}
                                </p>
                            </div>
                        </div>

                        {tab === "default" ? (
                            <div className={styles.groupStack}>
                                {builtInLoading && !builtInCatalog ? (
                                    <section className={styles.templateGroup}>
                                        <div className={styles.groupHeader}>
                                            <div className={styles.groupTitleWrap}>
                                                <h3 className={styles.groupTitle}>Built-in templates</h3>
                                                <p className={styles.groupDescription}>
                                                    Preparing the shared Presenton template library for preview.
                                                </p>
                                            </div>
                                            <span className={styles.groupCount}>Loading</span>
                                        </div>
                                        <BuiltInTemplatesLoadingGrid />
                                    </section>
                                ) : null}
                                {builtInGroups.map((group) => (
                                    <section key={group.key} className={styles.templateGroup}>
                                        <div className={styles.groupHeader}>
                                            <div className={styles.groupTitleWrap}>
                                                <h3 className={styles.groupTitle}>{group.title}</h3>
                                                <p className={styles.groupDescription}>{group.description}</p>
                                            </div>
                                            <span className={styles.groupCount}>
                                                {group.templates.length} {group.templates.length === 1 ? "family" : "families"}
                                            </span>
                                        </div>

                                        <div className={styles.templateGrid}>
                                            {group.items.map(({ template, previewPriority }) => (
                                                <InbuiltTemplateCard
                                                    key={template.id}
                                                    template={template}
                                                    onOpen={handleOpenPreview}
                                                    previewPriority={previewPriority}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        ) : (
                            <section className={styles.templateGroup}>
                                <div className={styles.groupHeader}>
                                    <div className={styles.groupTitleWrap}>
                                        <h3 className={styles.groupTitle}>Custom templates</h3>
                                        <p className={styles.groupDescription}>
                                            Start a reusable template from scratch or reopen one of your saved custom layout systems.
                                        </p>
                                    </div>
                                    <span className={styles.groupCount}>
                                        {customLoading ? "Loading" : `${customTemplates.length} saved`}
                                    </span>
                                </div>

                                {customLoading ? (
                                    <div className={styles.templateGrid}>
                                        <CreateCustomTemplate variant="workspace" />
                                        <div className={styles.loadingCard}>
                                            <Loader2 className={cn("animate-spin", styles.loadingIcon)} />
                                            <p className={styles.loadingTitle}>Loading custom templates</p>
                                            <p className={styles.loadingText}>
                                                Pulling your saved template summaries and preview layouts into the workspace.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.templateGrid}>
                                        <CreateCustomTemplate variant="workspace" />
                                        {customTemplateItems.map(({ template, previewPriority }) => (
                                            <CustomTemplateCard
                                                key={template.id}
                                                template={template}
                                                previewPriority={previewPriority}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                </WorkspaceCard>
            </div>
        </div>
    );
};

export default LayoutPreview;
