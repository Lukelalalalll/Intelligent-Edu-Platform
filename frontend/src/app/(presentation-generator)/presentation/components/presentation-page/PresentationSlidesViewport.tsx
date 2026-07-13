import type { Key, MutableRefObject } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Slide } from "../../../types/slide";
import LoadingState from "../LoadingState";
import SlideContent from "../SlideContent";
import type { StreamLoadingState } from "../../hooks/presentationStreaming/shared";

export type PresentationSlide = Slide;

type VirtualSlideItem = {
  index: number;
  key: Key;
  start: number;
};

export type PresentationSlidesVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => VirtualSlideItem[];
  measureElement: (element: Element | null) => void;
};

export type PresentationSlidesViewportProps = {
  presentationId: string;
  hasPresentationData: boolean;
  loading: boolean;
  stream: string | null;
  loadingState: StreamLoadingState;
  slides: PresentationSlide[];
  slidesScrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  slidesVirtualizer: PresentationSlidesVirtualizer;
  highlightedSlideIndex: number | null;
  isChatSending: boolean;
  targetedSlidesSet: Set<number>;
};

const PresentationSlidesFallback = ({
  stream,
  loadingState,
}: Pick<PresentationSlidesViewportProps, "stream" | "loadingState">) => {
  return (
    <div className="relative mx-auto h-[calc(100dvh-var(--nav-height,60px)-10rem)] w-full px-2 hide-scrollbar">
      {Array.from({ length: 2 }).map((_, index) => (
        <Skeleton
          key={index}
          className="mx-auto my-4 aspect-video w-full bg-gray-400"
        />
      ))}
      {stream ? (
        <LoadingState
          statusText={loadingState.statusText}
          detailText={loadingState.detailText}
          waitingForFirstContent={loadingState.waitingForFirstContent}
        />
      ) : null}
    </div>
  );
};

const PresentationSlidesList = ({
  presentationId,
  slides,
  slidesVirtualizer,
  highlightedSlideIndex,
  isChatSending,
  targetedSlidesSet,
}: Omit<
  PresentationSlidesViewportProps,
  | "hasPresentationData"
  | "loading"
  | "stream"
  | "loadingState"
  | "slidesScrollContainerRef"
>) => {
  return (
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
              presentationId={presentationId}
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
  );
};

const PresentationSlidesViewport = ({
  presentationId,
  hasPresentationData,
  loading,
  stream,
  loadingState,
  slides,
  slidesScrollContainerRef,
  slidesVirtualizer,
  highlightedSlideIndex,
  isChatSending,
  targetedSlidesSet,
}: PresentationSlidesViewportProps) => {
  const shouldShowFallback =
    !hasPresentationData || loading || slides.length === 0;

  return (
    <div className="h-full min-w-0 flex-1 pt-3">
      <div
        ref={slidesScrollContainerRef}
        className="h-full overflow-y-auto scroll-pt-3 font-inter hide-scrollbar"
      >
        {shouldShowFallback ? (
          <PresentationSlidesFallback
            stream={stream}
            loadingState={loadingState}
          />
        ) : (
          <PresentationSlidesList
            presentationId={presentationId}
            slides={slides}
            slidesVirtualizer={slidesVirtualizer}
            highlightedSlideIndex={highlightedSlideIndex}
            isChatSending={isChatSending}
            targetedSlidesSet={targetedSlidesSet}
          />
        )}
      </div>
    </div>
  );
};

export default PresentationSlidesViewport;

