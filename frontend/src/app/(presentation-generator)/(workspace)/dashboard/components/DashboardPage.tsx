"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/presenton/shims/next-link";
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
import { DashboardApi, PresentationResponse } from "@/app/(presentation-generator)/services/api/dashboard";
import { PresentationGrid } from "@/app/(presentation-generator)/(workspace)/dashboard/components/PresentationGrid";
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
import { usePathname } from "@/presenton/shims/next-navigation";
import Card from "@/shared/components/Card/Card";
import styles from "./DashboardPage.module.css";

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
      <LayoutDashboard
        className={styles.navIcon}
        color={active ? "#007b55" : "#667085"}
      />
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
];

const sortOptions: Array<{ value: DeckSortDirection; label: string; description: string }> = [
  { value: "desc", label: "Latest first", description: "Most recently updated decks first" },
  { value: "asc", label: "Oldest first", description: "Earliest updated decks first" },
];

const DashboardPage: React.FC = () => {
  const pathname = usePathname();
  const [presentations, setPresentations] = useState<PresentationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deckSortDirection, setDeckSortDirection] = useState<DeckSortDirection>("desc");

  const fetchPresentations = useCallback(async () => {
    let fetchedCount = 0;
    let hasError = false;

    try {
      setIsLoading(true);
      setError(null);
      const data = await DashboardApi.getPresentations();
      fetchedCount = data.length;
      setPresentations(data);
    } catch (err) {
      hasError = true;
      console.error("Failed to load dashboard presentations", err);
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "We couldn't load your deck history right now."
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
  }, [pathname]);

  useEffect(() => {
    void fetchPresentations();
  }, [fetchPresentations]);

  const sortedPresentations = useMemo(
    () => sortPresentations(presentations, deckSortDirection),
    [presentations, deckSortDirection]
  );

  const historyGroups = useMemo(
    () => buildPresentationHistoryGroups(sortedPresentations),
    [sortedPresentations]
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
    ? formatPresentationDate(getPresentationTimestamp(latestPresentation), "dateTime")
    : "No deck history yet";

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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <WelcomeBanner
          title="Slide Presentation"
          subtitle="Create new decks, reopen recent work, and keep your Presenton workspace moving without leaving the flow."
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
                  Presenton workspace
                </div>
                <h2 className={styles.heroTitle}>
                  Build the next deck in a workspace that feels calm again.
                </h2>
                <p className={styles.heroDescription}>
                  Start a presentation, keep your latest decks within reach, and move through
                  Presenton without fighting a crowded first screen.
                </p>
              </div>

              <div className={styles.heroActions}>
                <Link
                  href="/upload"
                  onClick={() => handleCreatePresentationClick("dashboard_primary_cta")}
                  className={styles.primaryAction}
                >
                  <span>Create Presentation</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <p className={styles.helperText}>
                  New decks continue with your saved providers, model choices, and theme workflow,
                  so the workspace keeps its momentum.
                </p>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHead}>
                    <span className={styles.summaryLabel}>Deck history</span>
                    <LayoutDashboard className={styles.summaryIcon} />
                  </div>
                  <div className={styles.summaryValue}>{presentations.length}</div>
                  <div className={styles.summaryMeta}>
                    {presentations.length === 1 ? "Saved deck" : "Saved decks"} ready to reopen
                  </div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.summaryHead}>
                    <span className={styles.summaryLabel}>Recent activity</span>
                    <Clock3 className={styles.summaryIcon} />
                  </div>
                  <div className={styles.summaryValue}>
                    {latestPresentation ? formatPresentationDate(getPresentationTimestamp(latestPresentation), "short") : "None yet"}
                  </div>
                  <div className={styles.summaryMeta}>{latestUpdatedLabel}</div>
                </div>

                <div className={styles.summaryCard}>
                  <div className={styles.summaryHead}>
                    <span className={styles.summaryLabel}>Workspace scope</span>
                    <History className={styles.summaryIcon} />
                  </div>
                  <div className={styles.summaryValue}>{totalSlides > 0 ? totalSlides : "Ready"}</div>
                  <div className={styles.summaryMeta}>
                    {totalSlides > 0 ? "Slides currently tracked across decks" : "Waiting for the first deck"}
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
                  Deck workspace
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
                  Deck history
                </div>
                <h2 className={styles.historyTitle}>Your deck history</h2>
                <p className={styles.historyDescription}>
                  Browse every presentation generated in Presenton, reopen the latest work, and keep
                  older decks tidy without leaving the dashboard.
                </p>
              </div>

              <div className={styles.historyControls}>
                <div className={styles.miniStats}>
                  <div className={styles.miniStat}>
                    <span className={styles.miniStatLabel}>Total decks</span>
                    <div className={styles.miniStatValue}>{presentations.length}</div>
                  </div>
                  <div className={styles.miniStat}>
                    <span className={styles.miniStatLabel}>Recent update</span>
                    <div className={styles.miniStatValue}>
                      {latestPresentation
                        ? formatPresentationDate(getPresentationTimestamp(latestPresentation), "short")
                        : "No activity"}
                    </div>
                  </div>
                </div>

                <div className={styles.sortTabs} role="tablist" aria-label="Deck history sort order">
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
              <PresentationGrid
                groups={historyGroups}
                isLoading={isLoading}
                error={error}
                onRetry={fetchPresentations}
                onCreatePresentationClick={() => handleCreatePresentationClick("dashboard_history_empty")}
                onPresentationDeleted={removePresentation}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
