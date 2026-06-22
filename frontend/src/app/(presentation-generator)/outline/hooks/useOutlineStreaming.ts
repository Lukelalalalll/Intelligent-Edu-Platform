import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notify } from "@/components/ui/sonner";
import { setOutlines } from "@/store/slices/presentationGeneration";
import { jsonrepair } from "jsonrepair";
import { RootState } from "@/store/store";
import { getApiUrl } from "@/utils/api";
import { ensurePresentonSession } from "../../services/api/presenton-fetch";

const MAX_STREAM_RETRIES = 3;
const STREAM_RETRY_DELAY_MS = 1_000;

type OutlineSlide = { content: string };
const STREAM_FLUSH_INTERVAL_MS = 140;

export const useOutlineStreaming = (presentationId: string | null) => {
  const dispatch = useDispatch();
  const { outlines } = useSelector(
    (state: RootState) => state.presentationGeneration
  );
  const [isStreaming, setIsStreaming] = useState(outlines.length === 0);
  const [isLoading, setIsLoading] = useState(outlines.length === 0);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number | null>(null);
  const [highestActiveIndex, setHighestActiveIndex] = useState<number>(-1);
  const [statusMessage, setStatusMessage] = useState(
    "Preparing your presentation outline"
  );
  const [streamedOutlines, setStreamedOutlines] = useState<OutlineSlide[]>(outlines);
  const outlinesRef = useRef(outlines);
  const prevSlidesRef = useRef<OutlineSlide[]>([]);
  const activeIndexRef = useRef<number>(-1);
  const highestIndexRef = useRef<number>(-1);
  const pendingSlidesRef = useRef<OutlineSlide[] | null>(null);
  const flushTimerRef = useRef<number | null>(null);

  const displayOutlines = isStreaming ? streamedOutlines : outlines;

  useEffect(() => {
    outlinesRef.current = outlines;
  }, [outlines]);

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
      setStatusMessage("Preparing your presentation outline");
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
        await ensurePresentonSession();
      } catch (error) {
        console.error("Failed to validate session before outline stream:", error);
        if (!scheduleRetry("session validation failed")) {
          resetStreamingState();
          notify.error("Connection failed", "Please log in again and retry.");
        }
        return;
      }

      eventSource = new EventSource(
        getApiUrl(`/api/v1/ppt/outlines/stream/${presentationId}`)
      );

      eventSource.addEventListener("response", (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          if (!scheduleRetry("invalid SSE payload")) {
            resetStreamingState();
            notify.error(
              "Stream parse failed",
              "Failed to parse outline stream response."
            );
          }
          return;
        }

        switch (data.type) {
          case "status":
            if (data.status) {
              setStatusMessage((current) =>
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
              setStatusMessage("Outline ready");
              activeIndexRef.current = -1;
              highestIndexRef.current = -1;
              isClosed = true;
              closeEventSource();
              clearRetryTimer();
              retryCount = 0;
            } catch {
              if (!scheduleRetry("failed to parse complete payload")) {
                resetStreamingState();
                notify.error("Parse failed", "Failed to parse presentation data.");
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
                "Outline streaming failed",
                data.detail ||
                  "Failed to connect to the server. Please try again."
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
            "Connection failed",
            "Failed to connect to the server. Please try again."
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
