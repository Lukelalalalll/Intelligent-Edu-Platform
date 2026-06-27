import React from "react";
import {
    ChevronRight,
    LayoutDashboard,
    Palette,
    PanelTop,
    Sparkles,
} from "lucide-react";

import Link from "@/presenton/shims/next-link";
import type { CustomTemplates } from "@/app/hooks/useCustomTemplates";
import { cn } from "@/lib/utils";
import { useI18n } from "@/shared/i18n";
import WorkspaceCard from "@/shared/components/Card/Card";

import CreateCustomTemplate from "./CreateCustomTemplate";
import {
    BuiltInTemplateCard,
    BuiltInTemplatesLoadingGrid,
    CustomTemplateCard,
    CustomTemplatesLoadingCard,
} from "./TemplatePanelCards";
import { getBuiltInGroupCopy } from "./templatePanelHelpers";
import type {
    BuiltInLibraryState,
    CustomLibraryState,
    TemplatePanelSectionCopy,
    TemplatePanelStat,
    TemplateTab,
} from "./templatePanelTypes";
import styles from "./TemplatePanel.module.css";

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

type TemplatePanelNavigationProps = {
    pathname: string;
};

type TemplatePanelControlsProps = {
    tab: TemplateTab;
    activeTabDescription: string;
    stats: TemplatePanelStat[];
    onCreateTemplateClick: () => void;
    onTabChange: (tab: TemplateTab) => void;
};

type TemplatePanelLibraryProps = {
    tab: TemplateTab;
    sectionCopy: TemplatePanelSectionCopy;
    builtIn: BuiltInLibraryState;
    custom: CustomLibraryState;
    onOpenBuiltInPreview: (id: string) => void;
    onOpenCustomTemplate: (template: CustomTemplates) => void;
};

export function TemplatePanelNavigation({ pathname }: TemplatePanelNavigationProps) {
    const { t } = useI18n();

    const navItems = [
        {
            href: "/dashboard",
            label: t("presenton.workspace.nav.dashboard"),
            renderIcon: presentonNavItems[0].renderIcon,
        },
        {
            href: "/templates",
            label: t("presenton.workspace.nav.templates"),
            renderIcon: presentonNavItems[1].renderIcon,
        },
        {
            href: "/theme",
            label: t("presenton.workspace.nav.theme"),
            renderIcon: presentonNavItems[2].renderIcon,
        },
    ] as const;

    return (
        <div className={styles.navShell}>
            <nav className={styles.navList} aria-label={t("presenton.workspace.nav.aria")}>
                {navItems.map(({ href, label, renderIcon }) => {
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
    );
}

export function TemplatePanelControls({
    tab,
    activeTabDescription,
    stats,
    onCreateTemplateClick,
    onTabChange,
}: TemplatePanelControlsProps) {
    const { t } = useI18n();

    return (
        <WorkspaceCard className={styles.surfaceCard}>
            <div className={styles.controlSection}>
                <div className={styles.controlTop}>
                    <div className={styles.controlCopy}>
                        <div className={styles.badge}>
                            <Sparkles className="h-3.5 w-3.5" />
                            {t("presenton.templates.controls.badge")}
                        </div>
                        <h2 className={styles.controlTitle}>{t("presenton.templates.controls.title")}</h2>
                        <p className={styles.controlDescription}>
                            {t("presenton.templates.controls.body")}
                        </p>
                    </div>

                    <div className={styles.controlActions}>
                        <Link
                            href="/custom-template"
                            onClick={onCreateTemplateClick}
                            className={styles.primaryAction}
                            aria-label={t("presenton.templates.controls.createAria")}
                        >
                            <span>{t("presenton.templates.controls.create")}</span>
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                        <p className={styles.controlHelper}>
                            {t("presenton.templates.controls.helper")}
                        </p>
                    </div>
                </div>

                <div className={styles.controlBottom}>
                    <div className={styles.tabBlock}>
                        <div className={styles.tabRail} role="tablist" aria-label={t("presenton.templates.tabs.aria")}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "default"}
                                className={cn(styles.tabButton, tab === "default" && styles.tabButtonActive)}
                                onClick={() => onTabChange("default")}
                            >
                                {t("presenton.templates.tabs.builtIn")}
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "custom"}
                                className={cn(styles.tabButton, tab === "custom" && styles.tabButtonActive)}
                                onClick={() => onTabChange("custom")}
                            >
                                {t("presenton.templates.tabs.custom")}
                            </button>
                        </div>
                        <p className={styles.activeTabNote}>{activeTabDescription}</p>
                    </div>

                    <div className={styles.statsGrid}>
                        {stats.map((stat) => (
                            <div key={stat.label} className={styles.statCard}>
                                <span className={styles.statLabel}>{stat.label}</span>
                                <div className={styles.statValue}>{stat.value}</div>
                                <p className={styles.statMeta}>{stat.meta}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </WorkspaceCard>
    );
}

export function TemplatePanelLibrary({
    tab,
    sectionCopy,
    builtIn,
    custom,
    onOpenBuiltInPreview,
    onOpenCustomTemplate,
}: TemplatePanelLibraryProps) {
    return (
        <WorkspaceCard className={styles.surfaceCard}>
            <div className={styles.contentSection}>
                <div className={styles.sectionIntro}>
                    <div className={styles.sectionTitleWrap}>
                        <div className={cn(styles.badge, styles.mutedBadge)}>
                            <PanelTop className="h-3.5 w-3.5" />
                            {sectionCopy.badgeLabel}
                        </div>
                        <h2 className={styles.sectionTitle}>{sectionCopy.title}</h2>
                        <p className={styles.sectionDescription}>{sectionCopy.description}</p>
                    </div>
                </div>

                {tab === "default" ? (
                    <BuiltInTemplateLibrary
                        builtIn={builtIn}
                        onOpenBuiltInPreview={onOpenBuiltInPreview}
                    />
                ) : (
                    <CustomTemplateLibrary
                        custom={custom}
                        onOpenCustomTemplate={onOpenCustomTemplate}
                    />
                )}
            </div>
        </WorkspaceCard>
    );
}

function BuiltInTemplateLibrary({
    builtIn,
    onOpenBuiltInPreview,
}: {
    builtIn: BuiltInLibraryState;
    onOpenBuiltInPreview: (id: string) => void;
}) {
    const { t } = useI18n();

    return (
        <div className={styles.groupStack}>
            {builtIn.isLoading && !builtIn.hasCatalog ? (
                <section className={styles.templateGroup}>
                    <div className={styles.groupHeader}>
                        <div className={styles.groupTitleWrap}>
                            <h3 className={styles.groupTitle}>{t("presenton.templates.builtIn.loading.title")}</h3>
                            <p className={styles.groupDescription}>
                                {t("presenton.templates.builtIn.loading.body")}
                            </p>
                        </div>
                        <span className={styles.groupCount}>{t("presenton.templates.builtIn.loading.count")}</span>
                    </div>
                    <BuiltInTemplatesLoadingGrid />
                </section>
            ) : null}

            {builtIn.groups.map((group) => {
                const localizedGroup = getBuiltInGroupCopy(
                    group.key,
                    group.title,
                    group.description,
                    t,
                );

                return (
                    <section key={group.key} className={styles.templateGroup}>
                    <div className={styles.groupHeader}>
                        <div className={styles.groupTitleWrap}>
                            <h3 className={styles.groupTitle}>{localizedGroup.title}</h3>
                            <p className={styles.groupDescription}>{localizedGroup.description}</p>
                        </div>
                        <span className={styles.groupCount}>
                            {group.templates.length === 1
                                ? t("presenton.templates.builtIn.count.one", { count: group.templates.length })
                                : t("presenton.templates.builtIn.count.other", { count: group.templates.length })}
                        </span>
                    </div>

                    <div className={styles.templateGrid}>
                        {group.items.map(({ template, previewPriority }) => (
                            <BuiltInTemplateCard
                                key={template.id}
                                template={template}
                                previewPriority={previewPriority}
                                onOpen={onOpenBuiltInPreview}
                            />
                        ))}
                    </div>
                </section>
                );
            })}
        </div>
    );
}

function CustomTemplateLibrary({
    custom,
    onOpenCustomTemplate,
}: {
    custom: CustomLibraryState;
    onOpenCustomTemplate: (template: CustomTemplates) => void;
}) {
    const { t } = useI18n();

    return (
        <section className={styles.templateGroup}>
            <div className={styles.groupHeader}>
                <div className={styles.groupTitleWrap}>
                    <h3 className={styles.groupTitle}>{t("presenton.templates.custom.title")}</h3>
                    <p className={styles.groupDescription}>
                        {t("presenton.templates.custom.body")}
                    </p>
                </div>
                <span className={styles.groupCount}>
                    {custom.isLoading
                        ? t("presenton.templates.custom.count.loading")
                        : t("presenton.templates.custom.count.saved", { count: custom.count })}
                </span>
            </div>

            <div className={styles.templateGrid}>
                <CreateCustomTemplate variant="workspace" />
                {custom.isLoading ? (
                    <CustomTemplatesLoadingCard />
                ) : (
                    custom.items.map(({ template, previewPriority }) => (
                        <CustomTemplateCard
                            key={template.id}
                            template={template}
                            previewPriority={previewPriority}
                            onOpen={onOpenCustomTemplate}
                        />
                    ))
                )}
            </div>
        </section>
    );
}
