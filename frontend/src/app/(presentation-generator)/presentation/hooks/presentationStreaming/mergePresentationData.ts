import type { PresentationData } from "@/store/slices/presentationGeneration";

/** Chunk JSON replays each slide as first streamed; don't clobber URLs filled by `slide_assets`. */
const PLACEHOLDER_ASSET_MARKERS = [
  "/static/images/placeholder",
  "/static/icons/placeholder",
  "placeholder.jpg",
  "placeholder.svg",
];

function isPlaceholderAssetUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) {
    return false;
  }

  const normalizedUrl = url.toLowerCase();
  return PLACEHOLDER_ASSET_MARKERS.some((marker) =>
    normalizedUrl.includes(marker)
  );
}

function mergeContentPreservingResolvedAssets(prev: any, incoming: any): any {
  if (incoming === undefined || incoming === null) {
    return prev;
  }
  if (prev === undefined || prev === null) {
    return incoming;
  }

  if (Array.isArray(incoming)) {
    if (!Array.isArray(prev)) {
      return incoming;
    }

    let changed = prev.length !== incoming.length;
    const mergedArray = incoming.map((item, index) => {
      const mergedItem = mergeContentPreservingResolvedAssets(prev[index], item);
      if (mergedItem !== prev[index]) {
        changed = true;
      }
      return mergedItem;
    });

    return changed ? mergedArray : prev;
  }

  if (typeof incoming !== "object" || typeof prev !== "object") {
    return Object.is(prev, incoming) ? prev : incoming;
  }

  const result: Record<string, unknown> = {};
  let changed = Object.keys(prev).length !== Object.keys(incoming).length;

  for (const key of Object.keys(incoming)) {
    const prevValue = prev[key];
    const incomingValue = incoming[key];
    let nextValue = incomingValue;

    if (incomingValue !== null && typeof incomingValue === "object") {
      if (prevValue !== null && typeof prevValue === "object") {
        nextValue = mergeContentPreservingResolvedAssets(prevValue, incomingValue);
      }
    } else {
      if (
        key === "__image_url__" &&
        typeof incomingValue === "string" &&
        typeof prevValue === "string" &&
        isPlaceholderAssetUrl(incomingValue) &&
        !isPlaceholderAssetUrl(prevValue)
      ) {
        nextValue = prevValue;
      }

      if (
        key === "__icon_url__" &&
        typeof incomingValue === "string" &&
        typeof prevValue === "string" &&
        isPlaceholderAssetUrl(incomingValue) &&
        !isPlaceholderAssetUrl(prevValue)
      ) {
        nextValue = prevValue;
      }

      if (Object.is(nextValue, prevValue)) {
        nextValue = prevValue;
      }
    }

    if (nextValue !== prevValue) {
      changed = true;
    }
    result[key] = nextValue;
  }

  return changed ? result : prev;
}

export function mergeSlidesPreservingResolvedAssets(
  prevSlides: any[] | undefined,
  incomingSlides: any[]
): any[] {
  if (!prevSlides?.length) {
    return incomingSlides;
  }

  return incomingSlides.map((incomingSlide, index) => {
    const prevSlide = prevSlides[index];
    if (!prevSlide) {
      return incomingSlide;
    }

    const mergedContent = mergeContentPreservingResolvedAssets(
      prevSlide.content,
      incomingSlide.content
    );

    const canReusePreviousSlide =
      mergedContent === prevSlide.content &&
      prevSlide.id === incomingSlide.id &&
      prevSlide.index === incomingSlide.index &&
      prevSlide.layout === incomingSlide.layout &&
      prevSlide.layout_group === incomingSlide.layout_group &&
      prevSlide.speaker_note === incomingSlide.speaker_note &&
      prevSlide.title === incomingSlide.title &&
      prevSlide.type === incomingSlide.type;

    if (canReusePreviousSlide) {
      return prevSlide;
    }

    if (mergedContent === incomingSlide.content) {
      return incomingSlide;
    }

    return {
      ...incomingSlide,
      content: mergedContent,
    };
  });
}

export function mergeStreamedPresentationData(
  previous: PresentationData | null | undefined,
  incoming: Partial<PresentationData>
): PresentationData | null {
  if (!Array.isArray(incoming.slides) || incoming.slides.length === 0) {
    return null;
  }

  return {
    ...(previous ?? {}),
    ...incoming,
    slides: mergeSlidesPreservingResolvedAssets(previous?.slides, incoming.slides),
  } as PresentationData;
}
