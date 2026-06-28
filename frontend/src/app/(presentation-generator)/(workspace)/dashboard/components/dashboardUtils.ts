import { PresentationResponse } from "@/app/(presentation-generator)/services/api/dashboard";
import { type Locale } from "@/shared/i18n";
export type DeckSortDirection = "desc" | "asc";

export type PresentationHistoryGroup = {
  key: "recent" | "earlier";
  title: string;
  description: string;
  items: PresentationResponse[];
};

type DashboardTranslator = (
  key:
    | "ppt_generator.dashboard.group.all.title"
    | "ppt_generator.dashboard.group.all.body"
    | "ppt_generator.dashboard.group.recent.title"
    | "ppt_generator.dashboard.group.recent.body"
    | "ppt_generator.dashboard.group.earlier.title"
    | "ppt_generator.dashboard.group.earlier.body",
  vars?: Record<string, string | number>
) => string;

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const DATE_LOCALE_MAP: Record<Locale, string> = {
  en: "en",
  "zh-CN": "zh-CN",
  "zh-HK": "zh-HK",
};

function getDateFormatter(
  locale: Locale,
  variant: "short" | "long" | "dateTime"
) {
  const dateLocale = DATE_LOCALE_MAP[locale] ?? locale;

  if (variant === "short") {
    return new Intl.DateTimeFormat(dateLocale, {
      month: "short",
      day: "numeric",
    });
  }

  if (variant === "dateTime") {
    return new Intl.DateTimeFormat(dateLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return new Intl.DateTimeFormat(dateLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getPresentationTimestamp(
  presentation: Pick<PresentationResponse, "updated_at" | "created_at">
): number {
  const rawValue = presentation.updated_at || presentation.created_at || "";
  const timestamp = rawValue ? new Date(rawValue).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortPresentations(
  presentations: PresentationResponse[],
  direction: DeckSortDirection
): PresentationResponse[] {
  return [...presentations].sort((first, second) => {
    const firstTimestamp = getPresentationTimestamp(first);
    const secondTimestamp = getPresentationTimestamp(second);
    return direction === "desc"
      ? secondTimestamp - firstTimestamp
      : firstTimestamp - secondTimestamp;
  });
}

export function getLatestPresentation(
  presentations: PresentationResponse[]
): PresentationResponse | null {
  if (!presentations.length) return null;

  return presentations.reduce((latest, current) => {
    return getPresentationTimestamp(current) > getPresentationTimestamp(latest)
      ? current
      : latest;
  });
}

export function getPresentationSlideCount(
  presentation: Pick<PresentationResponse, "slides" | "n_slides">
): number {
  if (Array.isArray(presentation.slides) && presentation.slides.length > 0) {
    return presentation.slides.length;
  }

  if (
    typeof presentation.n_slides === "number" &&
    Number.isFinite(presentation.n_slides) &&
    presentation.n_slides > 0
  ) {
    return presentation.n_slides;
  }

  return 0;
}

export function isPresentationRecentlyUpdated(
  presentation: Pick<PresentationResponse, "updated_at" | "created_at">,
  now = Date.now()
): boolean {
  const timestamp = getPresentationTimestamp(presentation);
  if (!timestamp) return false;
  return now - timestamp <= RECENT_WINDOW_MS;
}

export function buildPresentationHistoryGroups(
  presentations: PresentationResponse[],
  t: DashboardTranslator,
  now = Date.now()
): PresentationHistoryGroup[] {
  if (!presentations.length) return [];

  const recent = presentations.filter((presentation) =>
    isPresentationRecentlyUpdated(presentation, now)
  );
  const earlier = presentations.filter(
    (presentation) => !isPresentationRecentlyUpdated(presentation, now)
  );

  if (!recent.length || !earlier.length) {
    return [
      {
        key: recent.length ? "recent" : "earlier",
        title: t("ppt_generator.dashboard.group.all.title"),
        description: t("ppt_generator.dashboard.group.all.body"),
        items: presentations,
      },
    ];
  }

  const recentGroup: PresentationHistoryGroup = {
    key: "recent",
    title: t("ppt_generator.dashboard.group.recent.title"),
    description: t("ppt_generator.dashboard.group.recent.body"),
    items: recent,
  };

  const earlierGroup: PresentationHistoryGroup = {
    key: "earlier",
    title: t("ppt_generator.dashboard.group.earlier.title"),
    description: t("ppt_generator.dashboard.group.earlier.body"),
    items: earlier,
  };

  const firstGroupIsRecent = isPresentationRecentlyUpdated(presentations[0], now);
  return firstGroupIsRecent ? [recentGroup, earlierGroup] : [earlierGroup, recentGroup];
}

export function formatPresentationDate(
  timestamp: number,
  locale: Locale,
  variant: "short" | "long" | "dateTime" = "long",
  fallbackLabel = "Unknown"
): string {
  if (!timestamp) return fallbackLabel;
  return getDateFormatter(locale, variant).format(timestamp);
}

