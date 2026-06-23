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
import WorkspaceCard from "@/shared/components/Card/Card";

import CreateCustomTemplate from "./CreateCustomTemplate";
import {
    BuiltInTemplateCard,
    BuiltInTemplatesLoadingGrid,
    CustomTemplateCard,
    CustomTemplatesLoadingCard,
} from "./TemplatePanelCards";
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
    return (
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
    );
}

export function TemplatePanelControls({
    tab,
    activeTabDescription,
    stats,
    onCreateTemplateClick,
    onTabChange,
}: TemplatePanelControlsProps) {
    return (
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
                            onClick={onCreateTemplateClick}
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
                                onClick={() => onTabChange("default")}
                            >
                                Built-in
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={tab === "custom"}
                                className={cn(styles.tabButton, tab === "custom" && styles.tabButtonActive)}
                                onClick={() => onTabChange("custom")}
                            >
                                Custom
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
        <WorkspaceCard className={cn(styles.surfaceCard, styles.motionCard, styles.motionSecondary)}>
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
    return (
        <div className={styles.groupStack}>
            {builtIn.isLoading && !builtIn.hasCatalog ? (
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

            {builtIn.groups.map((group) => (
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
                            <BuiltInTemplateCard
                                key={template.id}
                                template={template}
                                previewPriority={previewPriority}
                                onOpen={onOpenBuiltInPreview}
                            />
                        ))}
                    </div>
                </section>
            ))}
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
    return (
        <section className={styles.templateGroup}>
            <div className={styles.groupHeader}>
                <div className={styles.groupTitleWrap}>
                    <h3 className={styles.groupTitle}>Custom templates</h3>
                    <p className={styles.groupDescription}>
                        Start a reusable template from scratch or reopen one of your saved custom layout systems.
                    </p>
                </div>
                <span className={styles.groupCount}>
                    {custom.isLoading ? "Loading" : `${custom.count} saved`}
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
