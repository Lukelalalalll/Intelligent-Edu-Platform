import { PresentationResponse } from "@/app/(presentation-generator)/services/api/dashboard";

export type DeckSortDirection = "desc" | "asc";

export type PresentationHistoryGroup = {
  key: "recent" | "earlier";
  title: string;
  description: string;
  items: PresentationResponse[];
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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
        title: "All decks",
        description: "Sorted by latest activity across your Presenton workspace.",
        items: presentations,
      },
    ];
  }

  const recentGroup: PresentationHistoryGroup = {
    key: "recent",
    title: "Recently updated",
    description: "Decks touched in the last 7 days.",
    items: recent,
  };

  const earlierGroup: PresentationHistoryGroup = {
    key: "earlier",
    title: "Earlier",
    description: "Older decks that are still available to reopen or clean up.",
    items: earlier,
  };

  const firstGroupIsRecent = isPresentationRecentlyUpdated(presentations[0], now);
  return firstGroupIsRecent ? [recentGroup, earlierGroup] : [earlierGroup, recentGroup];
}

export function formatPresentationDate(
  timestamp: number,
  variant: "short" | "long" | "dateTime" = "long"
): string {
  if (!timestamp) return "Unknown";

  if (variant === "short") {
    return shortDateFormatter.format(timestamp);
  }

  if (variant === "dateTime") {
    return dateTimeFormatter.format(timestamp);
  }

  return longDateFormatter.format(timestamp);
}
