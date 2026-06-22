"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RootState } from "@/store/store";
import "../../utils/prism-languages";
import { Skeleton } from "@/components/ui/skeleton";
import PresentationMode from "./PresentationMode";
import SidePanel from "./SidePanel";
import SlideContent from "./SlideContent";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { AlertCircle } from "lucide-react";
import {
  usePresentationStreaming,
  usePresentationData,
  usePresentationNavigation,
  useAutoSave,
} from "../hooks";
import { PresentationPageProps } from "../types";
import LoadingState from "./LoadingState";
import { applyPresentationThemeToElement } from "../utils/applyPresentationThemeDom";
import PresentationHeader from "./PresentationHeader";
import Chat from "./Chat";

const MAIN_SLIDE_ESTIMATE_PX = 860;
const MAIN_SLIDE_OVERSCAN = 2;

const PresentationPage: React.FC<PresentationPageProps> = ({
  presentation_id,
}) => {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChatSending, setIsChatSending] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const [agentFocusedSlide, setAgentFocusedSlide] = useState<number | null>(
    null
  );
  const [agentFocusEventId, setAgentFocusEventId] = useState<string | null>(
    null
  );
  const [glowingSlideIndex, setGlowingSlideIndex] = useState<number | null>(
    null
  );
  const [chatTargetedSlides, setChatTargetedSlides] = useState<number[]>([]);
  const [error, setError] = useState(false);

  const slidesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);

  const presentationData = useSelector(
    (state: RootState) => state.presentationGeneration.presentationData
  );
  const isStreaming = useSelector(
    (state: RootState) => Boolean(state.presentationGeneration.isStreaming)
  );

  const slides = presentationData?.slides ?? [];
  const slidesLength = slides.length;
  const presentationTheme = presentationData?.theme;
  const lastStreamingSlideIndex = slidesLength > 0 ? slidesLength - 1 : undefined;

  const { isSaving } = useAutoSave({
    debounceMs: 2000,
    enabled: !!presentationData && !isStreaming,
  });

  const { fetchUserSlides } = usePresentationData(
    presentation_id,
    setLoading,
    setError
  );

  const {
    isPresentMode,
    stream,
    currentSlide: presentSlideFromUrl,
    handleSlideClick,
    toggleFullscreen,
    handlePresentExit,
    handleSlideChange,
  } = usePresentationNavigation(
    presentation_id,
    selectedSlide,
    setSelectedSlide,
    setIsFullscreen
  );

  const { loadingState } = usePresentationStreaming(
    presentation_id,
    stream,
    setLoading,
    setError,
    fetchUserSlides
  );

  const slidesVirtualizer = useVirtualizer({
    count: slidesLength,
    getScrollElement: () => slidesScrollContainerRef.current,
    estimateSize: () => MAIN_SLIDE_ESTIMATE_PX,
    overscan: MAIN_SLIDE_OVERSCAN,
    getItemKey: (index) => slides[index]?.id || `${slides[index]?.index ?? index}`,
  });

  const scheduleSlideScroll = useCallback(
    (
      index: number,
      options: {
        behavior?: ScrollBehavior;
        align?: "auto" | "start" | "center" | "end";
      } = {}
    ) => {
      if (slidesLength === 0) {
        return;
      }

      const clampedIndex = Math.min(Math.max(index, 0), slidesLength - 1);

      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }

      pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
        pendingScrollFrameRef.current = null;
        slidesVirtualizer.scrollToIndex(clampedIndex, {
          align: options.align ?? "start",
          behavior: options.behavior ?? "auto",
        });
      });
    },
    [slidesLength, slidesVirtualizer]
  );

  useEffect(
    () => () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (slidesLength === 0) {
      if (selectedSlide !== 0) {
        setSelectedSlide(0);
      }
      return;
    }

    if (selectedSlide > slidesLength - 1) {
      setSelectedSlide(slidesLength - 1);
    }
  }, [selectedSlide, slidesLength]);

  useEffect(() => {
    if (!isStreaming || lastStreamingSlideIndex === undefined) {
      return;
    }

    scheduleSlideScroll(lastStreamingSlideIndex, {
      behavior: "auto",
      align: "start",
    });
  }, [isStreaming, lastStreamingSlideIndex, scheduleSlideScroll]);

  useEffect(() => {
    trackEvent(MixpanelEvent.Presentation_Editor_Viewed, {
      pathname,
      presentation_id,
      stream_mode: !!stream,
      presentation_mode: isPresentMode ? "present" : "edit",
    });
  }, [pathname, presentation_id, stream, isPresentMode]);

  useLayoutEffect(() => {
    if (isPresentMode || !presentationTheme) return;
    const el = document.getElementById("presentation-slides-wrapper");
    applyPresentationThemeToElement(el, presentationTheme);
  }, [isPresentMode, presentationTheme]);

  const onSlideChange = useCallback(
    (newSlide: number) => {
      handleSlideChange(newSlide, slidesLength);
    },
    [handleSlideChange, slidesLength]
  );

  const handlePresentationChanged = useCallback(() => {
    return fetchUserSlides({ clearHistory: false });
  }, [fetchUserSlides]);

  const handleEditorSlideSelect = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      if (slidesLength === 0) {
        return;
      }

      const clampedIndex = Math.min(Math.max(index, 0), slidesLength - 1);
      handleSlideClick(clampedIndex);
      scheduleSlideScroll(clampedIndex, {
        behavior,
        align: "start",
      });
    },
    [handleSlideClick, scheduleSlideScroll, slidesLength]
  );

  const handleChatSendingStateChange = useCallback((sending: boolean) => {
    setIsChatSending(sending);
    if (sending) {
      setChatTargetedSlides((previous) =>
        previous.length === 0 ? previous : []
      );
      return;
    }
    setAgentFocusedSlide(null);
    setAgentFocusEventId(null);
  }, []);

  const handleAgentSlideFocus = useCallback(
    ({ slideIndex, eventId }: { slideIndex: number; eventId: string }) => {
      if (slideIndex < 0) {
        return;
      }
      setAgentFocusedSlide(slideIndex);
      setAgentFocusEventId(eventId);
      setChatTargetedSlides((previous) =>
        previous.includes(slideIndex) ? previous : [...previous, slideIndex]
      );
    },
    []
  );

  const totalSlides = slidesLength;
  const highlightedSlideIndex = glowingSlideIndex;
  const targetedSlidesSet = useMemo(
    () => new Set(chatTargetedSlides),
    [chatTargetedSlides]
  );

  useEffect(() => {
    if (!isFollowModeEnabled || !isChatSending || totalSlides <= 0) {
      return;
    }
    if (agentFocusedSlide === null) {
      return;
    }

    const clampedIndex = Math.min(
      Math.max(agentFocusedSlide, 0),
      totalSlides - 1
    );

    if (clampedIndex !== selectedSlide) {
      handleEditorSlideSelect(clampedIndex, "auto");
    }
  }, [
    agentFocusEventId,
    agentFocusedSlide,
    handleEditorSlideSelect,
    isChatSending,
    isFollowModeEnabled,
    selectedSlide,
    totalSlides,
  ]);

  useEffect(() => {
    if (totalSlides <= 0) {
      setGlowingSlideIndex(null);
      setChatTargetedSlides([]);
      return;
    }

    if (!isChatSending) {
      if (glowingSlideIndex === null && chatTargetedSlides.length === 0) {
        return;
      }
      const clearTimer = window.setTimeout(() => {
        setGlowingSlideIndex(null);
        setChatTargetedSlides([]);
      }, 900);
      return () => window.clearTimeout(clearTimer);
    }

    if (agentFocusedSlide === null) {
      if (glowingSlideIndex !== null) {
        setGlowingSlideIndex(null);
      }
      return;
    }

    const targetIndex = Math.min(
      Math.max(agentFocusedSlide, 0),
      totalSlides - 1
    );
    setGlowingSlideIndex(targetIndex);
  }, [
    agentFocusedSlide,
    chatTargetedSlides.length,
    glowingSlideIndex,
    isChatSending,
    totalSlides,
  ]);

  if (isPresentMode) {
    return (
      <PresentationMode
        slides={slides}
        currentSlide={presentSlideFromUrl}
        theme={presentationTheme ?? undefined}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
        onExit={handlePresentExit}
        onSlideChange={onSlideChange}
      />
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--nav-height,60px)-8rem)] flex-col items-center justify-center bg-gray-100 font-syne">
        <div
          className="flex flex-col items-center rounded-lg border border-red-300 bg-white px-6 py-8 text-red-700 shadow-lg"
          role="alert"
        >
          <AlertCircle className="mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
          <p className="mb-4 text-center">
            We couldn&apos;t load your presentation. Please try again.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              onClick={() => {
                trackEvent(
                  MixpanelEvent.PresentationPage_Refresh_Page_Button_Clicked,
                  { pathname }
                );
                window.location.reload();
              }}
            >
              Refresh Page
            </Button>
            <Button
              onClick={() => {
                trackEvent(MixpanelEvent.Navigation, {
                  from: pathname,
                  to: "/upload",
                });
                router.push("/upload");
              }}
            >
              Go to Upload
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-var(--nav-height,60px))] min-h-[720px] overflow-hidden font-syne">
      <div
        id="presentation-slides-wrapper"
        style={{ background: "#EDEEEF" }}
        className="relative flex h-full flex-col overflow-hidden"
      >
        <PresentationHeader
          presentation_id={presentation_id}
          isPresentationSaving={isSaving}
          currentSlide={selectedSlide}
        />
        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden xl:gap-4">
          <div className="sticky top-0 h-full w-[112px] shrink-0 self-start pt-3">
            <SidePanel
              selectedSlide={selectedSlide}
              onSlideClick={handleEditorSlideSelect}
              presentationId={presentation_id}
              loading={loading}
            />
          </div>
          <div className="relative flex h-full min-w-0 flex-1 gap-3 xl:gap-4">
            <div className="h-full min-w-0 flex-1 pt-3">
              <div
                ref={slidesScrollContainerRef}
                className="h-full overflow-y-auto scroll-pt-3 font-inter hide-scrollbar"
              >
                {!presentationData || loading || slidesLength === 0 ? (
                  <div className="relative mx-auto h-[calc(100dvh-var(--nav-height,60px)-10rem)] w-full px-2 hide-scrollbar">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <Skeleton
                        key={index}
                        className="mx-auto my-4 aspect-video w-full bg-gray-400"
                      />
                    ))}
                    {stream && (
                      <LoadingState
                        statusText={loadingState.statusText}
                        detailText={loadingState.detailText}
                        waitingForFirstContent={loadingState.waitingForFirstContent}
                      />
                    )}
                  </div>
                ) : (
                  <div
                    className="relative w-full"
                    style={{
                      height: slidesVirtualizer.getTotalSize(),
                      minHeight: "100%",
                    }}
                  >
                    {slidesVirtualizer.getVirtualItems().map((virtualItem) => {
                      const slide = slides[virtualItem.index];
                      if (!slide) {
                        return null;
                      }

                      return (
                        <div
                          key={virtualItem.key}
                          ref={slidesVirtualizer.measureElement}
                          data-index={virtualItem.index}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                          className="px-2 pb-6"
                        >
                          <SlideContent
                            slide={slide}
                            index={virtualItem.index}
                            presentationId={presentation_id}
                            isChatEditing={
                              highlightedSlideIndex !== null &&
                              virtualItem.index === highlightedSlideIndex
                            }
                            isChatTargeted={
                              isChatSending &&
                              highlightedSlideIndex !== virtualItem.index &&
                              targetedSlidesSet.has(virtualItem.index)
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="sticky top-0 h-full w-full max-w-[370px] shrink-0 self-start">
              <Chat
                presentationId={presentation_id}
                currentSlide={selectedSlide}
                onPresentationChanged={handlePresentationChanged}
                onChatSendingStateChange={handleChatSendingStateChange}
                onFollowModeChange={setIsFollowModeEnabled}
                onAgentSlideFocus={handleAgentSlideFocus}
              />
            </div>
            <div
              id="presentation-editor-overlay-root"
              className="pointer-events-none absolute inset-0 z-[90]"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationPage;
