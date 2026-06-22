"use client";

import React, { memo, useEffect, useMemo, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import usePrefersReducedMotion from "@/shared/hooks/usePrefersReducedMotion";
import { FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { OutlineItem } from "./OutlineItem";
import styles from "./OutlineWorkspace.module.css";

type OutlineSlide = { content: string };

interface OutlineContentProps {
  outlines: OutlineSlide[] | null;
  isLoading: boolean;
  isStreaming: boolean;
  activeSlideIndex: number | null;
  highestActiveIndex: number;
  statusMessage: string;
  onDragEnd: (event: any) => void;
  onAddSlide: () => void;
  onUpdateSlide: (index: number, content: string) => void;
  onDeleteSlide: (index: number) => void;
}

const LoadingSkeleton = memo(function LoadingSkeleton({
  isLoading,
  outlines,
}: {
  isLoading: boolean;
  outlines: OutlineSlide[] | null;
}) {
  if (!isLoading || (outlines && outlines.length > 0)) return null;

  return (
    <div className={styles.skeletonWrap}>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className={styles.skeletonCard}>
          <div className={styles.skeletonPill} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineMid}`} />
          <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
        </div>
      ))}
    </div>
  );
});

const OutlineList = memo(function OutlineList({
  outlines,
  isStreaming,
  activeSlideIndex,
  highestActiveIndex,
  onDragEnd,
  onUpdateSlide,
  onDeleteSlide,
}: {
  outlines: OutlineSlide[];
  isStreaming: boolean;
  activeSlideIndex: number | null;
  highestActiveIndex: number;
  onDragEnd: (event: any) => void;
  onUpdateSlide: (index: number, content: string) => void;
  onDeleteSlide: (index: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortableItems = useMemo(
    () => outlines.map((_, index) => `slide-${index}`),
    [outlines]
  );

  const renderedItems = useMemo(
    () =>
      outlines.map((item, index) => (
        <OutlineItem
          key={`slide-${index}`}
          sortableId={`slide-${index}`}
          index={index + 1}
          slideOutline={item}
          isStreaming={isStreaming}
          isActiveStreaming={activeSlideIndex === index}
          isStableStreaming={highestActiveIndex >= 0 && index < highestActiveIndex}
          enableSorting={!isStreaming}
          onChange={onUpdateSlide}
          onDelete={onDeleteSlide}
        />
      )),
    [
      outlines,
      isStreaming,
      activeSlideIndex,
      highestActiveIndex,
      onUpdateSlide,
      onDeleteSlide,
    ]
  );

  if (isStreaming) {
    return <div className={styles.listStack}>{renderedItems}</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
        <div className={styles.listStack}>{renderedItems}</div>
      </SortableContext>
    </DndContext>
  );
});

const OutlineContent: React.FC<OutlineContentProps> = ({
  outlines,
  isLoading,
  isStreaming,
  activeSlideIndex,
  highestActiveIndex,
  statusMessage,
  onDragEnd,
  onAddSlide,
  onUpdateSlide,
  onDeleteSlide,
}) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const visibleSlides = outlines?.length ?? 0;
  const activeContent =
    activeSlideIndex !== null ? outlines?.[activeSlideIndex]?.content ?? "" : "";

  useEffect(() => {
    if (!isStreaming || activeSlideIndex === null) return undefined;

    const rafId = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      if (viewport.scrollHeight <= viewport.clientHeight + 1) {
        return;
      }

      const activeItem = viewport.querySelector<HTMLElement>(
        `[data-outline-item-index="${activeSlideIndex}"]`
      );
      if (!activeItem) return;

      const buffer = 36;
      const itemBottom = activeItem.offsetTop + activeItem.offsetHeight;
      const visibleBottom = viewport.scrollTop + viewport.clientHeight;

      if (itemBottom <= visibleBottom - buffer) {
        return;
      }

      const nextTop = Math.min(
        itemBottom - viewport.clientHeight + 48,
        viewport.scrollHeight - viewport.clientHeight
      );

      if (Math.abs(nextTop - viewport.scrollTop) < 6) {
        return;
      }

      viewport.scrollTo({
        top: nextTop,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeContent, activeSlideIndex, isStreaming, prefersReducedMotion, visibleSlides]);

  return (
    <section className={cn(styles.surfaceCard, styles.contentCard)}>
      <div className={styles.contentHeader}>
        <div className={styles.controlCopy}>
          <span className={styles.badge}>
            <Sparkles className="h-3.5 w-3.5" />
            Presenton outline workspace
          </span>
          <h2 className={styles.sectionTitle}>
            Tighten the outline before Presenton turns it into slides.
          </h2>
          <p className={styles.sectionDescription}>
            Streaming stays inside this panel, so the page frame remains calm while each
            slide settles into its final outline.
          </p>
        </div>

        <div className={styles.itemPillRow}>
          <span className={styles.mutedBadge}>
            <FileText className="h-3.5 w-3.5" />
            {visibleSlides} {visibleSlides === 1 ? "slide" : "slides"}
          </span>
          <span className={styles.mutedBadge}>
            {isStreaming ? "Live generation" : "Manual cleanup"}
          </span>
        </div>
      </div>

      <div className={cn(styles.statusRow, isStreaming && styles.statusRowLive)} aria-live="polite">
        <div className={styles.statusChip}>
          {isStreaming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[#0b6b4b]" />
              <span>{statusMessage}</span>
            </>
          ) : (
            <>
              <span className={styles.statusDot} aria-hidden="true" />
              <span>Outline ready for final cleanup</span>
            </>
          )}
        </div>
        <p className={styles.statusHint}>
          {isStreaming
            ? "When new content pushes past this viewport, the panel glides just enough to keep pace."
            : "Tap any slide to edit markdown directly, then drag cards to reorder once the outline feels right."}
        </p>
      </div>

      <LoadingSkeleton isLoading={isLoading} outlines={outlines} />

      {outlines && outlines.length > 0 ? (
        <>
          <div
            ref={viewportRef}
            className={styles.listViewport}
            data-testid="outline-list-viewport"
          >
            <OutlineList
              outlines={outlines}
              isStreaming={isStreaming}
              activeSlideIndex={activeSlideIndex}
              highestActiveIndex={highestActiveIndex}
              onDragEnd={onDragEnd}
              onUpdateSlide={onUpdateSlide}
              onDeleteSlide={onDeleteSlide}
            />
          </div>

          <div className={styles.listFooter}>
            <p className={styles.helperText}>
              New slides stay pinned inside this panel. If the stack still fits, it will not
              auto-scroll at all.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onAddSlide}
              disabled={isLoading || isStreaming}
              className={styles.secondaryButton}
            >
              <Plus className="h-4 w-4" />
              Add slide
            </Button>
          </div>
        </>
      ) : null}

      {!isStreaming && !isLoading && outlines && outlines.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FileText className="h-6 w-6" />
          </div>
          <h3 className={styles.groupTitle}>No outline slides yet</h3>
          <p className={styles.groupDescription}>
            Add the first slide manually, or head back and regenerate the outline from the
            source document.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onAddSlide}
            className={styles.secondaryButton}
          >
            <Plus className="h-4 w-4" />
            Add first slide
          </Button>
        </div>
      ) : null}
    </section>
  );
};

export default OutlineContent;
