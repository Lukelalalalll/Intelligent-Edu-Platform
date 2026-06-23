import type { MutableRefObject } from "react";
import { jsonrepair } from "jsonrepair";
import type { Slide } from "@/app/(presentation-generator)/types/slide";
import { notify } from "@/components/ui/sonner";
import {
  clearPresentationData,
  setPresentationData,
  setStreaming,
  updateSlide,
  type PresentationData,
} from "@/store/slices/presentationGeneration";
import type { AppDispatch } from "@/store/store";
import { normalizeBackendAssetUrls } from "@/utils/api";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { mergeStreamedPresentationData } from "./mergePresentationData";
import { drainSseEventBlocks } from "./sse";
import {
  DEFAULT_STREAM_LOADING_STATE,
  FINALIZING_STREAM_STATE,
  MAX_STREAM_RETRIES,
  RECEIVING_CONTENT_STATE,
  RESOLVING_ASSETS_STATE,
  STREAM_FIRST_CHUNK_TIMEOUT_MS,
  STREAM_PERSISTED_POLL_INTERVAL_MS,
  STREAM_RETRY_DELAY_MS,
  formatStreamStatus,
  getFailureLoadingState,
  getPersistedRecoveryCheckState,
  getRetryLoadingState,
  type FetchUserSlides,
  type StreamLoadingState,
} from "./shared";

type StreamBody = Pick<ReadableStream<Uint8Array>, "getReader">;

type StreamResponse = {
  ok: boolean;
  status?: number;
  body: StreamBody | null;
};

type StartPresentationStreamingSessionOptions = {
  presentationId: string;
  runId: number;
  streamRunRef: MutableRefObject<number>;
  dispatch: AppDispatch;
  setLoading: (loading: boolean) => void;
  setError: (error: boolean) => void;
  setLoadingState: (nextState: StreamLoadingState) => void;
  fetchUserSlides: FetchUserSlides;
  getCurrentPresentationData: () => PresentationData | null;
  requestStream: (signal: AbortSignal) => Promise<StreamResponse>;
};

function getWarningDetail(warning: unknown): string | null {
  if (
    warning &&
    typeof warning === "object" &&
    typeof (warning as { detail?: unknown }).detail === "string"
  ) {
    return (warning as { detail: string }).detail;
  }

  return null;
}

export function startPresentationStreamingSession({
  presentationId,
  runId,
  streamRunRef,
  dispatch,
  setLoading,
  setError,
  setLoadingState,
  fetchUserSlides,
  getCurrentPresentationData,
  requestStream,
}: StartPresentationStreamingSessionOptions) {
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

  const updateLoadingStateSafely = (nextState: StreamLoadingState) => {
    if (isRunActive()) {
      setLoadingState(nextState);
    }
  };

  const resetAttemptState = () => {
    accumulatedChunks = "";
    receivedChunkFrame = false;
    receivedStreamSignal = false;
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

  const clearAllTimers = () => {
    clearRetryTimer();
    clearFirstChunkTimer();
    clearPersistedPollTimer();
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

  const clearStreamQueryParam = () => {
    if (typeof window === "undefined") {
      return;
    }

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
          clearAllTimers();
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
    clearAllTimers();
    updateLoadingStateSafely(getFailureLoadingState(description));

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

  const openStream = async () => {
    if (!isRunActive()) {
      return;
    }

    closeStream({ invalidate: false });
    const streamToken = ++activeStreamToken;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const localAbortController = new AbortController();
    let buffer = "";

    resetAttemptState();
    updateLoadingStateSafely(DEFAULT_STREAM_LOADING_STATE);
    startFirstChunkTimer();
    abortController = localAbortController;

    try {
      const response = await requestStream(localAbortController.signal);

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
          const drained = drainSseEventBlocks(buffer);
          buffer = drained.remainingBuffer;

          for (const parsedEvent of drained.events) {
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
    resetAttemptState();
    updateLoadingStateSafely(getRetryLoadingState(retryCount));

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
      updateLoadingStateSafely(getPersistedRecoveryCheckState());
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

  const finalizeSuccessfulStream = (presentation: unknown) => {
    dispatch(
      setPresentationData(
        normalizeBackendAssetUrls(presentation) as PresentationData
      )
    );
    dispatch(setStreaming(false));
    setLoading(false);
    isClosed = true;
    closeStream();
    clearAllTimers();
    retryCount = 0;
    accumulatedChunks = "";
    clearStreamQueryParam();
  };

  const handleChunkPayload = (chunk: unknown) => {
    if (typeof chunk !== "string") {
      return;
    }

    receivedChunkFrame = true;
    updateLoadingStateSafely(RECEIVING_CONTENT_STATE);
    accumulatedChunks += chunk;

    try {
      const repairedJson = jsonrepair(accumulatedChunks);
      const partialData = JSON.parse(repairedJson) as Partial<PresentationData>;
      const normalizedPartialData = normalizeBackendAssetUrls(partialData);
      const mergedPresentation = mergeStreamedPresentationData(
        getCurrentPresentationData(),
        normalizedPartialData
      );

      if (mergedPresentation) {
        dispatch(setPresentationData(mergedPresentation));
        setLoading(false);
      }
    } catch {
      // JSON is still incomplete. Keep accumulating chunks.
    }
  };

  const handleSlideAssetsPayload = (data: Record<string, unknown>) => {
    updateLoadingStateSafely(RESOLVING_ASSETS_STATE);

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
          slide: normalizeBackendAssetUrls(data.slide) as Slide,
          markDirty: false,
        })
      );
    }

    if (Array.isArray(data.warnings)) {
      for (const warning of data.warnings) {
        const detail = getWarningDetail(warning);

        if (!detail || shownAssetWarnings.has(detail)) {
          continue;
        }

        shownAssetWarnings.add(detail);
        notify.warning("Some images could not be generated", detail, {
          duration: 12_000,
        });
      }
    }
  };

  const handleStreamPayload = (data: any) => {
    markStreamResponsive();

    switch (data.type) {
      case "chunk":
        handleChunkPayload(data.chunk);
        break;

      case "status":
        updateLoadingStateSafely(
          formatStreamStatus(String(data.status || ""), receivedChunkFrame)
        );
        break;

      case "slide_assets":
        handleSlideAssetsPayload(data);
        break;

      case "complete":
        updateLoadingStateSafely(FINALIZING_STREAM_STATE);
        try {
          finalizeSuccessfulStream(data.presentation);
        } catch {
          if (!scheduleRetry("failed to parse complete payload")) {
            void finalizeFailure(
              "Failed to parse the final presentation payload.",
              "failed to parse complete payload"
            );
          }
        }
        break;

      case "closing":
        updateLoadingStateSafely(FINALIZING_STREAM_STATE);
        finalizeSuccessfulStream(data.presentation);
        break;

      case "error":
        if (!scheduleRetry(data.detail || "server returned stream error response")) {
          void finalizeFailure(
            data.detail || "Failed to connect to the server. Please try again.",
            data.detail || "server returned stream error response"
          );
        }
        break;
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
    clearAllTimers();
  };
}
