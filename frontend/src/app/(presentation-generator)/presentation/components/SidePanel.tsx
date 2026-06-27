"use client";

import { AnimatePresence, motion } from "framer-motion";
import React, { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store/store";
import {
  DndContext,
  type DragEndEvent,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { setPresentationData } from "@/store/slices/presentationGeneration";
import { addToHistory } from "@/store/slices/undoRedoSlice";
import { SortableSlide } from "./SortableSlide";
import { Separator } from "@/components/ui/separator";
import { usePathname } from "next/navigation";
import NewSlide from "./NewSlide";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { SlideThumbnailCard } from "./SlideThumbnailCard";

interface SidePanelProps {
  selectedSlide: number;
  onSlideClick: (index: number) => void;
  presentationId: string;
  loading: boolean;
}

const PROJECT_UI_FONT_STACK =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif';

const THUMBNAIL_ESTIMATE_PX = 122;
const THUMBNAIL_OVERSCAN = 6;
const THUMBNAIL_VIRTUALIZE_THRESHOLD = 14;

const SidePanelComponent = ({
  selectedSlide,
  onSlideClick,
  presentationId,
  loading,
}: SidePanelProps) => {
  const pathname = usePathname();
  const [showNewSlideSelection, setShowNewSlideSelection] = useState(false);
  const [isSorting, setIsSorting] = useState(false);

  const presentationData = useSelector(
    (state: RootState) => state.presentationGeneration.presentationData
  );
  const isStreaming = useSelector(
    (state: RootState) => Boolean(state.presentationGeneration.isStreaming)
  );

  const dispatch = useDispatch();
  const listRef = useRef<HTMLDivElement | null>(null);
  const slides = presentationData?.slides ?? [];

  const lastSlideIndex = slides.length ? slides.length - 1 : 0;
  const lastSlideTemplateId = slides[lastSlideIndex]?.layout
    ? slides[lastSlideIndex].layout.split(":")[0]
    : "";
  const shouldVirtualize =
    !isSorting && slides.length > THUMBNAIL_VIRTUALIZE_THRESHOLD;

  const handleAddSlideClick = () => {
    if (!slides.length || isStreaming) return;
    setShowNewSlideSelection(true);
  };

  const closeNewSlideSelection = () => {
    setShowNewSlideSelection(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const rowVirtualizer = useVirtualizer({
    count: slides.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => THUMBNAIL_ESTIMATE_PX,
    overscan: THUMBNAIL_OVERSCAN,
    getItemKey: (index) => slides[index]?.id || `${slides[index]?.index ?? index}`,
  });

  useEffect(() => {
    if (!slides.length || selectedSlide < 0 || selectedSlide >= slides.length) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (shouldVirtualize) {
        rowVirtualizer.scrollToIndex(selectedSlide, { align: "center" });
        return;
      }

      const selectedThumbnail = listRef.current?.querySelector<HTMLElement>(
        `[data-thumbnail-index="${selectedSlide}"]`
      );
      selectedThumbnail?.scrollIntoView({
        block: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [rowVirtualizer, selectedSlide, shouldVirtualize, slides.length]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setIsSorting(false);

    if (!active || !over || !slides.length || !presentationData) return;

    if (active.id !== over.id) {
      const oldIndex = slides.findIndex((item: any) => item.id === active.id);
      const newIndex = slides.findIndex((item: any) => item.id === over.id);

      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      const reorderedArray = arrayMove(slides, oldIndex, newIndex);
      const updatedArray = reorderedArray.map((slide: any, index: number) => ({
        ...slide,
        index,
      }));

      dispatch(
        addToHistory({
          slides,
          actionType: "REORDER_SLIDES",
        })
      );
      dispatch(
        setPresentationData({
          data: { ...presentationData, slides: updatedArray },
          markDirty: true,
        })
      );

      trackEvent(MixpanelEvent.Presentation_Slides_Reordered, {
        pathname,
        presentation_id: presentationId,
        from_index: oldIndex,
        to_index: newIndex,
        slide_count: updatedArray.length,
      });
    }
  };

  if (!presentationData || loading || slides.length === 0) {
    return null;
  }

  const canRenderNewSlideModal =
    Boolean(lastSlideTemplateId) && typeof document !== "undefined";

  const newSlideModal = canRenderNewSlideModal
    ? createPortal(
        <AnimatePresence>
          {showNewSlideSelection ? (
            <motion.div
              key="new-slide-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-[1000] overflow-y-auto bg-[rgba(15,23,42,0.22)] px-4 py-16 backdrop-blur-sm"
              onClick={closeNewSlideSelection}
            >
              <div className="relative z-[1001] flex min-h-full items-start justify-center pt-10">
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.965 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 14, scale: 0.982 }}
                  transition={{
                    duration: 0.24,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="w-full max-w-[675px] will-change-transform"
                  onClick={(event) => event.stopPropagation()}
                >
                  <NewSlide
                    index={lastSlideIndex}
                    templateID={lastSlideTemplateId}
                    setShowNewSlideSelection={setShowNewSlideSelection}
                    presentationId={presentationId}
                  />
                </motion.div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
    <div
      className="h-full w-full px-3"
      style={{ fontFamily: PROJECT_UI_FONT_STACK }}
    >
      <div className="relative z-50 h-full xl:z-auto">
        <div className="slide-theme flex h-full w-full flex-col overflow-hidden hide-scrollbar">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => setIsSorting(true)}
            onDragCancel={() => setIsSorting(false)}
            onDragEnd={handleDragEnd}
          >
            <div
              ref={listRef}
              className="min-h-0 w-full flex-1 overflow-y-auto hide-scrollbar"
            >
              {isStreaming ? (
                shouldVirtualize ? (
                  <div
                    style={{
                      height: rowVirtualizer.getTotalSize(),
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                      const slide = slides[virtualItem.index];
                      if (!slide) {
                        return null;
                      }

                      return (
                        <div
                          key={virtualItem.key}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualItem.index}
                          style={{
                            position: "absolute",
                            top: virtualItem.start,
                            left: 0,
                            width: "100%",
                            paddingBottom: "18px",
                          }}
                        >
                          <SlideThumbnailCard
                            slide={slide}
                            index={virtualItem.index}
                            selected={selectedSlide === virtualItem.index}
                            onClick={() => onSlideClick(virtualItem.index)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-[18px] pb-1">
                    {slides.map((slide: any, index: number) => (
                      <SlideThumbnailCard
                        key={`${slide.id}-${index}`}
                        slide={slide}
                        index={index}
                        selected={selectedSlide === index}
                        onClick={() => onSlideClick(index)}
                      />
                    ))}
                  </div>
                )
              ) : (
                <SortableContext
                  items={slides.map((slide: any) => slide.id || `${slide.index}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {shouldVirtualize ? (
                    <div
                      style={{
                        height: rowVirtualizer.getTotalSize(),
                        position: "relative",
                        width: "100%",
                      }}
                    >
                      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const slide = slides[virtualItem.index];
                        if (!slide) {
                          return null;
                        }

                        return (
                          <div
                            key={virtualItem.key}
                            ref={rowVirtualizer.measureElement}
                            data-index={virtualItem.index}
                            style={{
                              position: "absolute",
                              top: virtualItem.start,
                              left: 0,
                              width: "100%",
                              paddingBottom: "18px",
                            }}
                          >
                            <SortableSlide
                              slide={slide}
                              index={virtualItem.index}
                              selectedSlide={selectedSlide}
                              onSlideClick={onSlideClick}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-[18px] pb-1">
                      {slides.map((slide: any, index: number) => (
                        <SortableSlide
                          key={`${slide.id}-${index}`}
                          slide={slide}
                          index={index}
                          selectedSlide={selectedSlide}
                          onSlideClick={onSlideClick}
                        />
                      ))}
                    </div>
                  )}
                </SortableContext>
              )}
            </div>
          </DndContext>
          <Separator orientation="horizontal" />

          <button
            type="button"
            onClick={handleAddSlideClick}
            className="mx-1 my-3 flex min-h-[88px] w-auto flex-col items-center justify-center gap-2 rounded-[22px] border border-[#EDEEEF] bg-white/90 px-4 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-colors hover:bg-white"
          >
            <Plus className="h-4 w-4 text-[#111827]" />
            <span className="text-[13px] font-medium text-[#111827]">
              Add Slide
            </span>
          </button>
        </div>
      </div>
      {newSlideModal}
    </div>
  );
};

export default memo(SidePanelComponent);
