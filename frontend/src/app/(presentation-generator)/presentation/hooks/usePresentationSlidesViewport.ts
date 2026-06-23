import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";

type PresentationSlideLike = {
  id?: string | null;
  index?: number;
};

export type SlideScrollBehavior = "auto" | "instant" | "smooth";

const MAIN_SLIDE_ESTIMATE_PX = 860;
const MAIN_SLIDE_OVERSCAN = 2;

type UsePresentationSlidesViewportOptions = {
  slides: PresentationSlideLike[];
  isStreaming: boolean;
  selectedSlide: number;
  onSlideClick: (index: number) => void;
  setSelectedSlide: (slide: number) => void;
};

export const usePresentationSlidesViewport = ({
  slides,
  isStreaming,
  selectedSlide,
  onSlideClick,
  setSelectedSlide,
}: UsePresentationSlidesViewportOptions) => {
  const slidesScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const slidesLength = slides.length;
  const lastStreamingSlideIndex =
    slidesLength > 0 ? slidesLength - 1 : undefined;

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
        behavior?: SlideScrollBehavior;
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
  }, [selectedSlide, setSelectedSlide, slidesLength]);

  useEffect(() => {
    if (!isStreaming || lastStreamingSlideIndex === undefined) {
      return;
    }

    scheduleSlideScroll(lastStreamingSlideIndex, {
      behavior: "auto",
      align: "start",
    });
  }, [isStreaming, lastStreamingSlideIndex, scheduleSlideScroll]);

  const handleEditorSlideSelect = useCallback(
    (index: number, behavior: SlideScrollBehavior = "smooth") => {
      if (slidesLength === 0) {
        return;
      }

      const clampedIndex = Math.min(Math.max(index, 0), slidesLength - 1);
      onSlideClick(clampedIndex);
      scheduleSlideScroll(clampedIndex, {
        behavior,
        align: "start",
      });
    },
    [onSlideClick, scheduleSlideScroll, slidesLength]
  );

  return {
    slidesLength,
    slidesScrollContainerRef,
    slidesVirtualizer,
    handleEditorSlideSelect,
  };
};
