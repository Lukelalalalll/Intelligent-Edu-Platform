"use client";

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/ppt_generator/shims/next-link";
import {
  ArrowRight,
  Clock3,
  History,
  LayoutDashboard,
  Palette,
  PanelTop,
  Sparkles,
} from "lucide-react";
import WelcomeBanner from "@/shared/components/WelcomeBanner";
import { useI18n } from "@/shared/i18n";
import {
  DashboardApi,
  DashboardPresentationSummary,
} from "@/app/(presentation-generator)/services/api/dashboard";
import {
  buildPresentationHistoryGroups,
  DeckSortDirection,
  formatPresentationDate,
  getLatestPresentation,
  getPresentationSlideCount,
  getPresentationTimestamp,
  sortPresentations,
} from "@/app/(presentation-generator)/(workspace)/dashboard/components/dashboardUtils";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { usePathname } from "@/ppt_generator/shims/next-navigation";
import { PPT_GENERATOR_ROUTE_PATHS } from "@/ppt_generator/routeMeta";
import { cn } from "@/lib/utils";
import entranceStyles from "@/shared/page-entrance/PageEntrance.module.css";
import {
  usePageEntrance,
} from "@/shared/page-entrance/usePageEntrance";
import Card from "@/shared/components/Card/Card";
import styles from "./DashboardPage.module.css";

const PresentationGrid = lazy(() =>
  import("@/app/(presentation-generator)/(workspace)/dashboard/components/PresentationGrid")
    .then((module) => ({ default: module.PresentationGrid })),
);

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

function DashboardHistorySkeleton() {
  return (
    <div className={styles.historySkeleton} aria-hidden="true">
      {Array.from({ length: 2 }).map((_, groupIndex) => (
        <section key={`history-skeleton-${groupIndex}`} className={styles.historySkeletonSection}>
          <div className={styles.historySkeletonHeader}>
            <div className={styles.historySkeletonTitle} />
            <div className={styles.historySkeletonDescription} />
          </div>
          <div className={styles.historySkeletonGrid}>
            {Array.from({ length: 4 }).map((__, cardIndex) => (
              <div key={`history-skeleton-card-${groupIndex}-${cardIndex}`} className={styles.historySkeletonCard}>
                <div className={styles.historySkeletonPreview} />
                <div className={styles.historySkeletonBody}>
                  <div className={styles.historySkeletonLineShort} />
                  <div className={styles.historySkeletonLineLong} />
                  <div className={styles.historySkeletonPills}>
                    <div className={styles.historySkeletonPill} />
                    <div className={styles.historySkeletonPill} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const DashboardPage: React.FC = () => {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const isEntranceActive = usePageEntrance();
  const [presentations, setPresentations] = useState<DashboardPresentationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deckSortDirection, setDeckSortDirection] = useState<DeckSortDirection>("desc");

  const fetchPresentations = useCallback(async (options?: { force?: boolean }) => {
    let fetchedCount = 0;
    let hasError = false;

    try {
      setIsLoading(true);
      setError(null);
      const data = await DashboardApi.getPresentations(options);
      fetchedCount = data.length;
      setPresentations(data);
    } catch (err) {
      hasError = true;
      console.error("Failed to load dashboard presentations", err);
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : t("ppt_generator.dashboard.loadError.fallback")
      );
      setPresentations([]);
    } finally {
      trackEvent(MixpanelEvent.Dashboard_Page_Viewed, {
        pathname,
        presentation_count: fetchedCount,
        load_failed: hasError,
      });
      setIsLoading(false);
    }
  }, [pathname, t]);

  useEffect(() => {
    void fetchPresentations();
  }, [fetchPresentations]);

  const sortedPresentations = useMemo(
    () => sortPresentations(presentations, deckSortDirection),
    [presentations, deckSortDirection]
  );

  const historyGroups = useMemo(
    () => buildPresentationHistoryGroups(sortedPresentations, t),
    [sortedPresentations, t]
  );

  const latestPresentation = useMemo(
    () => getLatestPresentation(presentations),
    [presentations]
  );

  const totalSlides = useMemo(
    () =>
      presentations.reduce((sum, presentation) => {
        return sum + getPresentationSlideCount(presentation);
      }, 0),
    [presentations]
  );

  const latestUpdatedLabel = latestPresentation
    ? formatPresentationDate(
        getPresentationTimestamp(latestPresentation),
        locale,
        "dateTime",
        t("ppt_generator.dashboard.card.unknownDate")
      )
    : t("ppt_generator.dashboard.summary.activity.none");

  const removePresentation = (presentationId: string) => {
    setPresentations((prev) => prev.filter((presentation) => presentation.id !== presentationId));
  };

  const handleCreatePresentationClick = (source: string) => {
    trackEvent(MixpanelEvent.Dashboard_New_Presentation_Clicked, {
      pathname,
      source,
      deck_count: presentations.length,
    });
  };

  const handleSortChange = (value: DeckSortDirection) => {
    if (value === deckSortDirection) return;
    setDeckSortDirection(value);
  };

  const pptGeneratorNavItems = useMemo(
    () => [
      {
        href: PPT_GENERATOR_ROUTE_PATHS.dashboard,
        label: t("ppt_generator.workspace.nav.dashboard"),
        renderIcon: (active: boolean) => (
          <LayoutDashboard
            className={styles.navIcon}
            color={active ? "#007b55" : "#667085"}
          />
        ),
      },
      {
        href: PPT_GENERATOR_ROUTE_PATHS.templates,
        label: t("ppt_generator.workspace.nav.templates"),
        renderIcon: (active: boolean) => <TemplateNavIcon active={active} />,
      },
      {
        href: PPT_GENERATOR_ROUTE_PATHS.theme,
        label: t("ppt_generator.workspace.nav.theme"),
        renderIcon: (active: boolean) => (
          <Palette className={styles.navIcon} color={active ? "#007b55" : "#667085"} />
        ),
      },
    ],
    [t]
  );

  const sortOptions: Array<{ value: DeckSortDirection; label: string; description: string }> = useMemo(
    () => [
      {
        value: "desc",
        label: t("ppt_generator.dashboard.history.sort.latest.label"),
        description: t("ppt_generator.dashboard.history.sort.latest.description"),
      },
      {
        value: "asc",
        label: t("ppt_generator.dashboard.history.sort.oldest.label"),
        description: t("ppt_generator.dashboard.history.sort.oldest.description"),
      },
    ],
    [t]
  );

  return (
    <div className={styles.page}>
      <div
        className={cn(
          styles.container,
          entranceStyles.workspaceEntrance,
          isEntranceActive && entranceStyles.workspaceEntranceActive,
        )}
      >
        <WelcomeBanner
          title={t("ppt_generator.dashboard.banner.title")}
          subtitle={t("ppt_generator.dashboard.banner.subtitle")}
          variant="workspace"
          className={styles.banner}
        />

        <div className={styles.navShell}>
          <nav className={styles.navList} aria-label={t("ppt_generator.workspace.nav.aria")}>
            {pptGeneratorNavItems.map(({ href, label, renderIcon }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}
                >
                  {renderIcon(isActive)}
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={styles.workspaceGrid}>
          <Card glass className={`${styles.sectionCard} ${styles.heroLeadCard}`}>
            <div className={styles.heroLeadBody}>
              <div className={styles.heroHeader}>
                <div className={styles.badge}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("ppt_generator.dashboard.hero.badge")}
                </div>
                <h2 className={styles.heroTitle}>
                  {t("ppt_generator.dashboard.hero.title")}
                </h2>
                <p className={styles.heroDescription}>
                  {t("ppt_generator.dashboard.hero.body")}
                </p>
              </div>

              <div className={styles.heroActions}>
                <Link
                  href="/upload"
                  onClick={() => handleCreatePresentationClick("dashboard_primary_cta")}
                  className={styles.primaryAction}
                >
                  <span>{t("ppt_generator.dashboard.hero.cta")}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className={styles.helperText}>
                  {t("ppt_generator.dashboard.hero.helper")}
                </p>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHead}>
                    <span className={styles.summaryLabel}>{t("ppt_generator.dashboard.summary.history.label")}</span>
                    <LayoutDashboard className={styles.summaryIcon} />
                  </div>
                  <div className={styles.summaryValue}>{presentations.length}</div>
                  <div className={styles.summaryMeta}>
                    {presentations.length === 1
                      ? t("ppt_generator.dashboard.summary.history.single")
                      : t("ppt_generator.dashboard.summary.history.other")}
                  </div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.summaryHead}>
                    <span className={styles.summaryLabel}>{t("ppt_generator.dashboard.summary.activity.label")}</span>
                    <Clock3 className={styles.summaryIcon} />
                  </div>
                  <div className={styles.summaryValue}>
                      {latestPresentation
                      ? formatPresentationDate(getPresentationTimestamp(latestPresentation), locale, "short")
                      : t("ppt_generator.dashboard.summary.activity.empty")}
                  </div>
                  <div className={styles.summaryMeta}>{latestUpdatedLabel}</div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.summaryHead}>
                    <span className={styles.summaryLabel}>{t("ppt_generator.dashboard.summary.scope.label")}</span>
                    <History className={styles.summaryIcon} />
                  </div>
                  <div className={styles.summaryValue}>
                    {totalSlides > 0 ? totalSlides : t("ppt_generator.dashboard.summary.scope.ready")}
                  </div>
                  <div className={styles.summaryMeta}>
                    {totalSlides > 0
                      ? t("ppt_generator.dashboard.summary.scope.metaTracked")
                      : t("ppt_generator.dashboard.summary.scope.metaWaiting")}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card glass className={`${styles.sectionCard} ${styles.heroPreviewCard}`}>
            <div className={styles.heroPreviewBody}>
              <div className={styles.previewStage}>
                <div className={styles.previewPill}>
                  <PanelTop className="h-3.5 w-3.5" />
                  {t("ppt_generator.dashboard.preview.badge")}
                </div>
                <div className={styles.previewDecks} aria-hidden="true">
                  <div
                    className={`${styles.previewCard} ${styles.previewCardBackLeft}`}
                    style={{ backgroundImage: "url('/create_presentation_card_3.png')" }}
                  />
                  <div
                    className={`${styles.previewCard} ${styles.previewCardCenter}`}
                    style={{ backgroundImage: "url('/create_presentation_card_2.png')" }}
                  />
                  <div
                    className={`${styles.previewCard} ${styles.previewCardBackRight}`}
                    style={{ backgroundImage: "url('/create_presentation_card_1.png')" }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card glass className={`${styles.sectionCard} ${styles.historySection}`}>
          <div className={styles.historySectionBody}>
            <div className={styles.historyHeader}>
              <div className={styles.historyIntro}>
                <div className={styles.mutedBadge}>
                  <History className="h-3.5 w-3.5" />
                  {t("ppt_generator.dashboard.history.badge")}
                </div>
                <h2 className={styles.historyTitle}>{t("ppt_generator.dashboard.history.title")}</h2>
                <p className={styles.historyDescription}>
                  {t("ppt_generator.dashboard.history.body")}
                </p>
              </div>

              <div className={styles.historyControls}>
                <div className={styles.miniStats}>
                  <div className={styles.miniStat}>
                    <span className={styles.miniStatLabel}>{t("ppt_generator.dashboard.history.stats.total")}</span>
                    <div className={styles.miniStatValue}>{presentations.length}</div>
                  </div>
                  <div className={styles.miniStat}>
                    <span className={styles.miniStatLabel}>{t("ppt_generator.dashboard.history.stats.recentUpdate")}</span>
                    <div className={styles.miniStatValue}>
                      {latestPresentation
                        ? formatPresentationDate(getPresentationTimestamp(latestPresentation), locale, "short")
                        : t("ppt_generator.dashboard.history.stats.none")}
                    </div>
                  </div>
                </div>

                <div className={styles.sortTabs} role="tablist" aria-label={t("ppt_generator.dashboard.history.sort.aria")}>
                  {sortOptions.map((option) => {
                    const isActive = option.value === deckSortDirection;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        title={option.description}
                        onClick={() => handleSortChange(option.value)}
                        className={`${styles.sortButton} ${isActive ? styles.sortButtonActive : ""}`.trim()}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.historyContent}>
              <Suspense fallback={<DashboardHistorySkeleton />}>
                <PresentationGrid
                  groups={historyGroups}
                  isLoading={isLoading}
                  error={error}
                  onRetry={() => void fetchPresentations({ force: true })}
                  onCreatePresentationClick={() => handleCreatePresentationClick("dashboard_history_empty")}
                  onPresentationDeleted={removePresentation}
                />
              </Suspense>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
