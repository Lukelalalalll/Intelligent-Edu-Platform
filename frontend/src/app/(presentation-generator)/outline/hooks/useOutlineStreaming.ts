import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notify } from "@/components/ui/sonner";
import { useI18n, type TranslationKey } from "@/shared/i18n";
import { appendPptGeneratorProviderParam } from "@/ppt_generator/providerOverride";
import { setOutlines } from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { RootState } from "@/store/store";
import { getApiUrl } from "@/utils/api";
import { ensurePptGeneratorSession } from "../../services/api/ppt_generator-fetch";

const MAX_STREAM_RETRIES = 3;
const STREAM_RETRY_DELAY_MS = 1_000;
const DEFAULT_STATUS_MESSAGE = "Preparing your presentation outline";
const READY_STATUS_MESSAGE = "Outline ready";
const SEARCHING_STATUS_PATTERN = /^Searching with (.+?): (.+)$/;

type OutlineSlide = { content: string };
const STREAM_FLUSH_INTERVAL_MS = 140;

type TranslateFn = (
  key: TranslationKey,
  vars?: Record<string, string | number>
) => string;

const localizeOutlineStatus = (status: string, t: TranslateFn) => {
  const searchingMatch = status.match(SEARCHING_STATUS_PATTERN);
  if (searchingMatch) {
    const [, provider, query] = searchingMatch;
    return t("ppt_generator.outline.stream.status.searchingWebWithProvider", {
      provider,
      query,
    });
  }

  switch (status) {
    case DEFAULT_STATUS_MESSAGE:
      return t("ppt_generator.outline.stream.status.preparing");
    case READY_STATUS_MESSAGE:
      return t("ppt_generator.outline.stream.status.ready");
    case "Analyzing your topic for web research":
      return t("ppt_generator.outline.stream.status.analyzingWeb");
    case "Web research complete":
      return t("ppt_generator.outline.stream.status.webComplete");
    case "Searching with model-native web search and drafting outlines":
      return t("ppt_generator.outline.stream.status.nativeSearchDrafting");
    case "Drafting your presentation outline":
      return t("ppt_generator.outline.stream.status.drafting");
    default:
      return status;
  }
};

export const useOutlineStreaming = (presentationId: string | null) => {
  const dispatch = useDispatch();
  const { t } = useI18n();
  const { outlines } = useSelector(
    (state: RootState) => state.presentationGeneration
  );
  const [isStreaming, setIsStreaming] = useState(outlines.length === 0);
  const [isLoading, setIsLoading] = useState(outlines.length === 0);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number | null>(null);
  const [highestActiveIndex, setHighestActiveIndex] = useState<number>(-1);
  const [rawStatusMessage, setRawStatusMessage] = useState(
    DEFAULT_STATUS_MESSAGE
  );
  const [streamedOutlines, setStreamedOutlines] = useState<OutlineSlide[]>(outlines);
  const outlinesRef = useRef(outlines);
  const prevSlidesRef = useRef<OutlineSlide[]>([]);
  const activeIndexRef = useRef<number>(-1);
  const highestIndexRef = useRef<number>(-1);
  const pendingSlidesRef = useRef<OutlineSlide[] | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const tRef = useRef(t);

  const displayOutlines = isStreaming ? streamedOutlines : outlines;
  const statusMessage = useMemo(
    () => localizeOutlineStatus(rawStatusMessage, t),
    [rawStatusMessage, t]
  );

  useEffect(() => {
    outlinesRef.current = outlines;
  }, [outlines]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!presentationId || outlinesRef.current.length > 0) return;

    let eventSource: EventSource | null = null;
    let accumulatedChunks = "";
    let retryCount = 0;
    let isClosed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const closeEventSource = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const cancelAnimationFrameFlush = () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };

    const flushPendingSlides = () => {
      flushTimerRef.current = null;
      const nextSlides = pendingSlidesRef.current;
      if (!nextSlides) return;

      setStreamedOutlines(nextSlides);
      setIsLoading(false);
    };

    const scheduleSlidesFlush = (nextSlides: OutlineSlide[]) => {
      pendingSlidesRef.current = nextSlides;
      if (flushTimerRef.current !== null) return;

      flushTimerRef.current = window.setTimeout(
        flushPendingSlides,
        STREAM_FLUSH_INTERVAL_MS
      );
    };

    const clearRetryTimer = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const resetStreamingState = () => {
      setIsStreaming(false);
      setIsLoading(false);
      setActiveSlideIndex(null);
      setHighestActiveIndex(-1);
      setRawStatusMessage(DEFAULT_STATUS_MESSAGE);
      setStreamedOutlines(outlinesRef.current);
      activeIndexRef.current = -1;
      highestIndexRef.current = -1;
      pendingSlidesRef.current = null;
      cancelAnimationFrameFlush();
    };

    const scheduleRetry = (reason: string): boolean => {
      if (retryCount >= MAX_STREAM_RETRIES || isClosed) {
        return false;
      }

      retryCount += 1;
      const retryDelay = STREAM_RETRY_DELAY_MS * retryCount;
      console.warn(
        `Outline stream retry ${retryCount}/${MAX_STREAM_RETRIES}: ${reason}`
      );

      closeEventSource();
      clearRetryTimer();
      accumulatedChunks = "";
      prevSlidesRef.current = [];
      activeIndexRef.current = -1;
      highestIndexRef.current = -1;
      pendingSlidesRef.current = null;
      cancelAnimationFrameFlush();

      retryTimer = setTimeout(() => {
        if (!isClosed) {
          void openStream();
        }
      }, retryDelay);

      return true;
    };

    const openStream = async () => {
      closeEventSource();
      try {
        await ensurePptGeneratorSession();
      } catch (error) {
        console.error("Failed to validate session before outline stream:", error);
        if (!scheduleRetry("session validation failed")) {
          resetStreamingState();
          notify.error(
            tRef.current("ppt_generator.outline.stream.notify.connectionFailed.title"),
            tRef.current("ppt_generator.outline.stream.notify.sessionFailed.body")
          );
        }
        return;
      }

      eventSource = new EventSource(
        appendPptGeneratorProviderParam(
          getApiUrl(`/api/v1/ppt/outlines/stream/${presentationId}`)
        )
      );

      eventSource.addEventListener("response", (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          if (!scheduleRetry("invalid SSE payload")) {
            resetStreamingState();
            notify.error(
              tRef.current("ppt_generator.outline.stream.notify.parseStream.title"),
              tRef.current("ppt_generator.outline.stream.notify.parseStream.body")
            );
          }
          return;
        }

        switch (data.type) {
          case "status":
            if (data.status) {
              setRawStatusMessage((current) =>
                current === data.status ? current : data.status
              );
            }
            break;

          case "chunk":
            accumulatedChunks += data.chunk;
            try {
              const repairedJson = jsonrepair(accumulatedChunks);
              const partialData = JSON.parse(repairedJson);

              if (partialData.slides) {
                const nextSlides: OutlineSlide[] = partialData.slides || [];
                let changedIndex: number | null = null;
                try {
                  const prev = prevSlidesRef.current || [];
                  const maxLen = Math.max(prev.length, nextSlides.length);
                  for (let i = 0; i < maxLen; i++) {
                    const prevContent = prev[i]?.content;
                    const nextContent = nextSlides[i]?.content;
                    if (nextContent !== prevContent) {
                      changedIndex = i;
                    }
                  }

                  const prevActive = activeIndexRef.current;
                  let nextActive = changedIndex ?? prevActive;
                  if (nextActive < prevActive) {
                    nextActive = prevActive;
                  }

                  if (nextActive !== activeIndexRef.current) {
                    activeIndexRef.current = nextActive;
                    setActiveSlideIndex(nextActive >= 0 ? nextActive : null);
                  }

                  if (nextActive > highestIndexRef.current) {
                    highestIndexRef.current = nextActive;
                    setHighestActiveIndex(nextActive);
                  }
                } catch {
                  // Ignore index tracking errors and keep streaming.
                }

                if (
                  changedIndex !== null ||
                  prevSlidesRef.current.length !== nextSlides.length
                ) {
                  prevSlidesRef.current = nextSlides;
                  scheduleSlidesFlush(nextSlides);
                }
              }
            } catch {
              // JSON isn't complete yet, continue accumulating
            }
            break;

          case "complete":
            try {
              const outlinesData: OutlineSlide[] =
                data.presentation.outlines.slides;
              cancelAnimationFrameFlush();
              pendingSlidesRef.current = null;
              setStreamedOutlines(outlinesData);
              prevSlidesRef.current = outlinesData;
              dispatch(setOutlines(outlinesData));
              setIsStreaming(false);
              setIsLoading(false);
              setActiveSlideIndex(null);
              setHighestActiveIndex(-1);
              setRawStatusMessage(READY_STATUS_MESSAGE);
              activeIndexRef.current = -1;
              highestIndexRef.current = -1;
              isClosed = true;
              closeEventSource();
              clearRetryTimer();
              retryCount = 0;
            } catch {
              if (!scheduleRetry("failed to parse complete payload")) {
                resetStreamingState();
                notify.error(
                  tRef.current("ppt_generator.outline.stream.notify.parsePresentation.title"),
                  tRef.current("ppt_generator.outline.stream.notify.parsePresentation.body")
                );
              }
            }
            accumulatedChunks = "";
            break;

          case "closing":
            setIsStreaming(false);
            setIsLoading(false);
            setActiveSlideIndex(null);
            setHighestActiveIndex(-1);
            activeIndexRef.current = -1;
            highestIndexRef.current = -1;
            pendingSlidesRef.current = null;
            cancelAnimationFrameFlush();
            isClosed = true;
            closeEventSource();
            clearRetryTimer();
            retryCount = 0;
            break;
          case "error":
            if (!scheduleRetry(data.detail || "server returned stream error")) {
              resetStreamingState();
              closeEventSource();
              notify.error(
                tRef.current("ppt_generator.outline.stream.notify.streamingFailed.title"),
                data.detail ||
                  tRef.current("ppt_generator.outline.stream.notify.streamingFailed.body")
              );
            }
            break;
        }
      });

      eventSource.onerror = () => {
        if (!scheduleRetry("connection lost")) {
          resetStreamingState();
          closeEventSource();
          notify.error(
            tRef.current("ppt_generator.outline.stream.notify.connectionFailed.title"),
            tRef.current("ppt_generator.outline.stream.notify.connectionFailed.body")
          );
        }
      };
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the SSE stream intentionally flips the UI into streaming mode at the same moment.
    setIsStreaming(true);
    setIsLoading(true);
    void openStream();

    return () => {
      isClosed = true;
      closeEventSource();
      clearRetryTimer();
      cancelAnimationFrameFlush();
    };
  }, [presentationId, dispatch]);

  return {
    displayOutlines,
    isStreaming,
    isLoading,
    activeSlideIndex,
    highestActiveIndex,
    statusMessage,
  };
};

