import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import {
  clearPresentationData,
  setPresentationData,
  setStreaming,
  updateSlide,
  type PresentationData,
} from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { notify } from "@/components/ui/sonner";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { getApiUrl, normalizeBackendAssetUrls } from "@/utils/api";
import { presentonFetch } from "../../services/api/presenton-fetch";
import { store } from "@/store/store";

const MAX_STREAM_RETRIES = 3;
const STREAM_RETRY_DELAY_MS = 1_000;
const STREAM_FIRST_CHUNK_TIMEOUT_MS = 18_000;
const STREAM_PERSISTED_POLL_INTERVAL_MS = 4_000;

type StreamLoadingState = {
  statusText: string;
  detailText: string;
  waitingForFirstContent: boolean;
};

const DEFAULT_STREAM_LOADING_STATE: StreamLoadingState = {
  statusText: "Connecting to the generator",
  detailText: "Preparing the presentation stream.",
  waitingForFirstContent: false,
};

const WAITING_FOR_FIRST_CONTENT_STATE: StreamLoadingState = {
  statusText: "Still generating",
  detailText:
    "The presentation is still being generated. Waiting for the first slide content to arrive.",
  waitingForFirstContent: true,
};

const RECEIVING_CONTENT_STATE: StreamLoadingState = {
  statusText: "Receiving slide content",
  detailText: "The first slides are starting to arrive.",
  waitingForFirstContent: false,
};

const RESOLVING_ASSETS_STATE: StreamLoadingState = {
  statusText: "Resolving slide assets",
  detailText: "Images and icons are still being attached to the slides.",
  waitingForFirstContent: false,
};

const FINALIZING_STREAM_STATE: StreamLoadingState = {
  statusText: "Finalizing the deck",
  detailText: "Saving the completed presentation.",
  waitingForFirstContent: false,
};

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
        nextValue = mergeContentPreservingResolvedAssets(
          prevValue,
          incomingValue
        );
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

function mergeSlidesPreservingResolvedAssets(
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

function parseSseEventBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const data: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (!data.length) {
    return null;
  }

  return { event, data: data.join("\n") };
}

function formatStreamStatus(status: string, receivedChunkFrame: boolean): StreamLoadingState {
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

export const usePresentationStreaming = (
  presentationId: string,
  stream: string | null,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
  fetchUserSlides: (options?: {
    clearHistory?: boolean;
    suppressError?: boolean;
    requireSlides?: boolean;
  }) => Promise<PresentationData | null>
) => {
  const dispatch = useDispatch();
  const streamRunRef = useRef(0);
  const [loadingState, setLoadingState] = useState<StreamLoadingState>(
    DEFAULT_STREAM_LOADING_STATE
  );

  useEffect(() => {
    if (!stream) {
      setLoadingState(DEFAULT_STREAM_LOADING_STATE);
      void fetchUserSlides();
      return;
    }

    const runId = ++streamRunRef.current;
    let abortController: AbortController | null = null;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let activeStreamToken = 0;
    let accumulatedChunks = "";
    let retryCount = 0;
    let isClosed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let firstChunkTimer: ReturnType<typeof setTimeout> | null = null;
    let persistedPollTimer: ReturnType<typeof setInterval> | null = null;
    let recoveryInFlight: Promise<boolean> | null = null;
    let receivedChunkFrame = false;
    let receivedStreamSignal = false;
    const shownAssetWarnings = new Set<string>();

    const isRunActive = (streamToken?: number) =>
      !isClosed &&
      streamRunRef.current === runId &&
      (streamToken === undefined || streamToken === activeStreamToken);

    const updateLoadingState = (nextState: StreamLoadingState) => {
      if (isRunActive()) {
        setLoadingState(nextState);
      }
    };

    const closeStream = (options?: { invalidate?: boolean }) => {
      if (options?.invalidate ?? true) {
        activeStreamToken += 1;
      }

      const readerToCancel = activeReader;
      activeReader = null;
      if (readerToCancel) {
        const cancelResult = readerToCancel.cancel();
        if (cancelResult && typeof cancelResult.catch === "function") {
          void cancelResult.catch(() => undefined);
        }
      }

      const controllerToAbort = abortController;
      abortController = null;
      controllerToAbort?.abort();
    };

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const clearFirstChunkTimer = () => {
      if (firstChunkTimer) {
        clearTimeout(firstChunkTimer);
        firstChunkTimer = null;
      }
    };

    const clearPersistedPollTimer = () => {
      if (persistedPollTimer) {
        clearInterval(persistedPollTimer);
        persistedPollTimer = null;
      }
    };

    const clearStreamQueryParam = () => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("stream");
      window.history.replaceState({}, "", nextUrl.toString());
    };

    const finalizeRecovery = () => {
      if (!isRunActive()) {
        return;
      }
      dispatch(setStreaming(false));
      setError(false);
      setLoading(false);
      clearStreamQueryParam();
    };

    const markStreamResponsive = () => {
      receivedStreamSignal = true;
      clearFirstChunkTimer();
    };

    const recoverFromPersistedPresentation = (reason: string): Promise<boolean> => {
      if (!isRunActive()) {
        return Promise.resolve(false);
      }
      if (recoveryInFlight) {
        return recoveryInFlight;
      }

      recoveryInFlight = (async () => {
        try {
          const recoveredPresentation = await fetchUserSlides({
            clearHistory: false,
            suppressError: true,
            requireSlides: true,
          });

          if (!isRunActive()) {
            return false;
          }

          if (recoveredPresentation?.slides?.length) {
            trackEvent(
              MixpanelEvent.Presentation_Stream_Recovered_From_Persisted_Data,
              {
                presentation_id: presentationId,
                reason,
                slide_count: recoveredPresentation.slides.length,
              }
            );
            isClosed = true;
            closeStream();
            clearRetryTimer();
            clearFirstChunkTimer();
            clearPersistedPollTimer();
            finalizeRecovery();
            return true;
          }
        } catch (error) {
          console.error("Failed to recover presentation after stream issue:", error);
        } finally {
          recoveryInFlight = null;
        }

        return false;
      })();

      return recoveryInFlight;
    };

    const finalizeFailure = async (description: string, reason: string) => {
      clearRetryTimer();
      clearFirstChunkTimer();
      clearPersistedPollTimer();
      updateLoadingState({
        statusText: "Unable to finish the presentation",
        detailText: description,
        waitingForFirstContent: false,
      });

      if (await recoverFromPersistedPresentation(reason)) {
        return;
      }

      if (!isRunActive()) {
        return;
      }

      isClosed = true;
      closeStream();
      setLoading(false);
      dispatch(setStreaming(false));
      setError(true);
      notify.error("Presentation streaming failed", description);
    };

    const scheduleRetry = (reason: string): boolean => {
      if (retryCount >= MAX_STREAM_RETRIES || !isRunActive()) {
        return false;
      }

      retryCount += 1;
      const retryDelay = STREAM_RETRY_DELAY_MS * retryCount;
      console.warn(
        `Presentation stream retry ${retryCount}/${MAX_STREAM_RETRIES}: ${reason}`
      );

      closeStream();
      clearRetryTimer();
      accumulatedChunks = "";
      receivedChunkFrame = false;
      receivedStreamSignal = false;
      updateLoadingState({
        statusText: `Reconnecting (${retryCount}/${MAX_STREAM_RETRIES})`,
        detailText: "The stream was interrupted. Trying again now.",
        waitingForFirstContent: false,
      });

      retryTimer = setTimeout(() => {
        if (isRunActive()) {
          void openStream();
        }
      }, retryDelay);

      return true;
    };

    const startFirstChunkTimer = () => {
      clearFirstChunkTimer();
      firstChunkTimer = setTimeout(() => {
        if (!isRunActive() || receivedStreamSignal) {
          return;
        }

        console.warn(
          `Presentation stream did not deliver a chunk within ${STREAM_FIRST_CHUNK_TIMEOUT_MS}ms for ${presentationId}; attempting persisted recovery.`
        );
        updateLoadingState({
          statusText: WAITING_FOR_FIRST_CONTENT_STATE.statusText,
          detailText:
            "Still generating. Checking whether a saved presentation is already available.",
          waitingForFirstContent: true,
        });
        void recoverFromPersistedPresentation("first chunk timeout");
      }, STREAM_FIRST_CHUNK_TIMEOUT_MS);
    };

    const startPersistedPoll = () => {
      clearPersistedPollTimer();
      persistedPollTimer = setInterval(() => {
        if (!isRunActive()) {
          return;
        }
        void recoverFromPersistedPresentation("persisted presentation poll");
      }, STREAM_PERSISTED_POLL_INTERVAL_MS);
    };

    const handleStreamPayload = (data: any) => {
      switch (data.type) {
        case "chunk":
          markStreamResponsive();
          receivedChunkFrame = true;
          updateLoadingState(RECEIVING_CONTENT_STATE);
          accumulatedChunks += data.chunk;
          try {
            const repairedJson = jsonrepair(accumulatedChunks);
            const partialData = JSON.parse(repairedJson);
            const normalizedPartialData = normalizeBackendAssetUrls(partialData);

            if (
              normalizedPartialData.slides &&
              normalizedPartialData.slides.length > 0
            ) {
              const prev =
                store.getState().presentationGeneration.presentationData;
              const mergedSlides = mergeSlidesPreservingResolvedAssets(
                prev?.slides,
                normalizedPartialData.slides
              );
              dispatch(
                setPresentationData({
                  ...(prev ?? {}),
                  ...normalizedPartialData,
                  slides: mergedSlides,
                } as PresentationData)
              );
              setLoading(false);
            }
          } catch {
            // JSON is still incomplete. Keep accumulating chunks.
          }
          break;

        case "status":
          markStreamResponsive();
          updateLoadingState(
            formatStreamStatus(String(data.status || ""), receivedChunkFrame)
          );
          break;

        case "slide_assets": {
          markStreamResponsive();
          updateLoadingState(RESOLVING_ASSETS_STATE);

          const slideIndex = data.slide_index;
          if (
            typeof slideIndex === "number" &&
            slideIndex >= 0 &&
            data.slide &&
            typeof data.slide === "object"
          ) {
            dispatch(
              updateSlide({
                index: slideIndex,
                slide: normalizeBackendAssetUrls(data.slide),
                markDirty: false,
              })
            );
          }

          if (Array.isArray(data.warnings)) {
            for (const warning of data.warnings) {
              const detail =
                warning &&
                typeof warning === "object" &&
                typeof warning.detail === "string"
                  ? warning.detail
                  : null;

              if (!detail || shownAssetWarnings.has(detail)) {
                continue;
              }

              shownAssetWarnings.add(detail);
              notify.warning("Some images could not be generated", detail, {
                duration: 12_000,
              });
            }
          }
          break;
        }

        case "complete":
          markStreamResponsive();
          updateLoadingState(FINALIZING_STREAM_STATE);
          try {
            dispatch(
              setPresentationData(normalizeBackendAssetUrls(data.presentation))
            );
            dispatch(setStreaming(false));
            setLoading(false);
            isClosed = true;
            closeStream();
            clearRetryTimer();
            clearFirstChunkTimer();
            clearPersistedPollTimer();
            retryCount = 0;
            clearStreamQueryParam();
          } catch {
            if (!scheduleRetry("failed to parse complete payload")) {
              void finalizeFailure(
                "Failed to parse the final presentation payload.",
                "failed to parse complete payload"
              );
            }
          }
          accumulatedChunks = "";
          break;

        case "closing":
          markStreamResponsive();
          updateLoadingState(FINALIZING_STREAM_STATE);
          dispatch(setPresentationData(normalizeBackendAssetUrls(data.presentation)));
          setLoading(false);
          dispatch(setStreaming(false));
          isClosed = true;
          closeStream();
          clearRetryTimer();
          clearFirstChunkTimer();
          clearPersistedPollTimer();
          retryCount = 0;
          clearStreamQueryParam();
          break;

        case "error":
          markStreamResponsive();
          if (
            !scheduleRetry(data.detail || "server returned stream error response")
          ) {
            void finalizeFailure(
              data.detail || "Failed to connect to the server. Please try again.",
              data.detail || "server returned stream error response"
            );
          }
          break;
      }
    };

    const openStream = async () => {
      if (!isRunActive()) {
        return;
      }

      closeStream({ invalidate: false });
      const streamToken = ++activeStreamToken;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const localAbortController = new AbortController();

      accumulatedChunks = "";
      receivedChunkFrame = false;
      receivedStreamSignal = false;
      updateLoadingState(DEFAULT_STREAM_LOADING_STATE);
      startFirstChunkTimer();
      abortController = localAbortController;

      try {
        const response = await presentonFetch(
          getApiUrl(`/api/v1/ppt/presentation/stream/${presentationId}`),
          {
            method: "GET",
            headers: {
              Accept: "text/event-stream",
            },
            cache: "no-store",
            signal: localAbortController.signal,
          }
        );

        if (!isRunActive(streamToken)) {
          localAbortController.abort();
          return;
        }

        if (!response.ok || !response.body) {
          const detail = response.ok
            ? "Stream response body was unavailable."
            : `Stream request failed with ${response.status}`;
          if (!scheduleRetry(detail)) {
            void finalizeFailure(detail, detail);
          }
          return;
        }

        reader = response.body.getReader();
        activeReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        while (isRunActive(streamToken)) {
          let readResult: ReadableStreamReadResult<Uint8Array>;
          try {
            readResult = await reader.read();
          } catch (error) {
            if (!isRunActive(streamToken)) {
              return;
            }
            throw error;
          }

          if (!isRunActive(streamToken)) {
            return;
          }

          const { value, done } = readResult;

          if (value) {
            buffer += decoder.decode(value, { stream: !done });
            buffer = buffer.replace(/\r\n/g, "\n");

            let separatorIndex = buffer.indexOf("\n\n");
            while (separatorIndex !== -1) {
              const rawBlock = buffer.slice(0, separatorIndex);
              buffer = buffer.slice(separatorIndex + 2);

              const parsedEvent = parseSseEventBlock(rawBlock);
              if (parsedEvent) {
                try {
                  handleStreamPayload(JSON.parse(parsedEvent.data));
                } catch {
                  if (!scheduleRetry("invalid SSE payload")) {
                    void finalizeFailure(
                      "Failed to parse the stream response.",
                      "invalid SSE payload"
                    );
                  }
                  return;
                }
              }

              separatorIndex = buffer.indexOf("\n\n");
            }
          }

          if (done) {
            break;
          }
        }

        if (!isRunActive(streamToken)) {
          return;
        }

        if (!scheduleRetry("stream ended unexpectedly")) {
          void finalizeFailure(
            "The presentation stream ended before completion.",
            "stream ended unexpectedly"
          );
        }
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          !isRunActive(streamToken)
        ) {
          return;
        }

        console.error("Presentation stream fetch failed:", error);
        if (!scheduleRetry("connection lost")) {
          void finalizeFailure(
            "Failed to connect to the server. Please try again.",
            "connection lost"
          );
        }
      } finally {
        if (activeReader === reader) {
          activeReader = null;
        }
        if (abortController === localAbortController) {
          abortController = null;
        }
      }
    };

    dispatch(setStreaming(true));
    dispatch(clearPresentationData());
    trackEvent(MixpanelEvent.Presentation_Stream_API_Call);
    setError(false);
    setLoading(true);
    startPersistedPoll();
    void openStream();

    return () => {
      if (streamRunRef.current === runId) {
        streamRunRef.current += 1;
      }
      isClosed = true;
      closeStream();
      clearRetryTimer();
      clearFirstChunkTimer();
      clearPersistedPollTimer();
    };
  }, [presentationId, stream, dispatch, setLoading, setError, fetchUserSlides]);

  return { loadingState };
};
