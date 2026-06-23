import type { PresentationData } from "@/store/slices/presentationGeneration";

export const MAX_STREAM_RETRIES = 3;
export const STREAM_RETRY_DELAY_MS = 1_000;
export const STREAM_FIRST_CHUNK_TIMEOUT_MS = 18_000;
export const STREAM_PERSISTED_POLL_INTERVAL_MS = 4_000;

export type StreamLoadingState = {
  statusText: string;
  detailText: string;
  waitingForFirstContent: boolean;
};

export type FetchUserSlides = (options?: {
  clearHistory?: boolean;
  suppressError?: boolean;
  requireSlides?: boolean;
}) => Promise<PresentationData | null>;

export const DEFAULT_STREAM_LOADING_STATE: StreamLoadingState = {
  statusText: "Connecting to the generator",
  detailText: "Preparing the presentation stream.",
  waitingForFirstContent: false,
};

export const WAITING_FOR_FIRST_CONTENT_STATE: StreamLoadingState = {
  statusText: "Still generating",
  detailText:
    "The presentation is still being generated. Waiting for the first slide content to arrive.",
  waitingForFirstContent: true,
};

export const RECEIVING_CONTENT_STATE: StreamLoadingState = {
  statusText: "Receiving slide content",
  detailText: "The first slides are starting to arrive.",
  waitingForFirstContent: false,
};

export const RESOLVING_ASSETS_STATE: StreamLoadingState = {
  statusText: "Resolving slide assets",
  detailText: "Images and icons are still being attached to the slides.",
  waitingForFirstContent: false,
};

export const FINALIZING_STREAM_STATE: StreamLoadingState = {
  statusText: "Finalizing the deck",
  detailText: "Saving the completed presentation.",
  waitingForFirstContent: false,
};

export function formatStreamStatus(
  status: string,
  receivedChunkFrame: boolean
): StreamLoadingState {
  const normalizedStatus = (status || "").trim().toLowerCase();

  if (normalizedStatus === "heartbeat") {
    return receivedChunkFrame
      ? {
          statusText: "Still generating",
          detailText: "More slide updates are still arriving in the background.",
          waitingForFirstContent: false,
        }
      : WAITING_FOR_FIRST_CONTENT_STATE;
  }

  if (!normalizedStatus || normalizedStatus === "starting") {
    return WAITING_FOR_FIRST_CONTENT_STATE;
  }

  const label = normalizedStatus
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());

  return {
    statusText: label,
    detailText: receivedChunkFrame
      ? "The generator is still streaming content and assets."
      : WAITING_FOR_FIRST_CONTENT_STATE.detailText,
    waitingForFirstContent: !receivedChunkFrame,
  };
}

export function getRetryLoadingState(retryCount: number): StreamLoadingState {
  return {
    statusText: `Reconnecting (${retryCount}/${MAX_STREAM_RETRIES})`,
    detailText: "The stream was interrupted. Trying again now.",
    waitingForFirstContent: false,
  };
}

export function getPersistedRecoveryCheckState(): StreamLoadingState {
  return {
    statusText: WAITING_FOR_FIRST_CONTENT_STATE.statusText,
    detailText:
      "Still generating. Checking whether a saved presentation is already available.",
    waitingForFirstContent: true,
  };
}

export function getFailureLoadingState(description: string): StreamLoadingState {
  return {
    statusText: "Unable to finish the presentation",
    detailText: description,
    waitingForFirstContent: false,
  };
}
