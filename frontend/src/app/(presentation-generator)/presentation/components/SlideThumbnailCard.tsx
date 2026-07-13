import React, { forwardRef, memo } from "react";
import type { Slide } from "../../types/slide";
import { V1ContentRender } from "../../components/V1ContentRender";

interface SlideThumbnailCardProps extends React.HTMLAttributes<HTMLDivElement> {
  slide: Slide;
  index: number;
  selected: boolean;
  renderMode?: "live" | "shell";
}

const SCALE = 0.12;

const SlideThumbnailCardInner = forwardRef<
  HTMLDivElement,
  SlideThumbnailCardProps
>(({ slide, index, selected, renderMode = "live", className = "", style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-thumbnail-index={index}
      style={{
        backgroundColor: "var(--card-color, #ffffff)",
        borderColor: selected ? "#5141e5" : "var(--stroke, #e5e7eb)",
        ...style,
      }}
      className={`relative cursor-pointer overflow-hidden rounded-[18px] border p-2.5 transition-[border-color,box-shadow,transform] duration-150 ${
        selected ? "border-[#BDB4FE]" : "border-[#EDEEEF]"
      } ${selected ? "shadow-[0_12px_26px_rgba(81,65,229,0.12)]" : "shadow-[0_8px_18px_rgba(15,23,42,0.05)]"} ${className}`}
      {...props}
    >
      <p className="pointer-events-none absolute right-2 top-1/2 z-50 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#E4E7EC] bg-white px-1.5 text-[11px] font-semibold text-[#111827] shadow-[0_6px_14px_rgba(15,23,42,0.12)]">
        {index + 1}
      </p>

      <div
        className="relative"
        style={{ height: `${720 * SCALE}px`, overflow: "hidden" }}
      >
        {renderMode === "live" ? (
          <div
            className="absolute top-0 left-0 overflow-hidden rounded-[12px] pointer-events-none"
            style={{
              width: 1280,
              height: 720,
              transformOrigin: "top left",
              transform: `scale(${SCALE})`,
            }}
          >
            <V1ContentRender slide={slide} isEditMode={false} />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col justify-between rounded-[10px] border border-[#F2F4F7] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-2.5">
            <div className="space-y-1.5">
              <div className="h-2.5 w-[62%] rounded-full bg-[#D0D5DD]" />
              <div className="h-2 w-[84%] rounded-full bg-[#E4E7EC]" />
              <div className="h-2 w-[52%] rounded-full bg-[#E4E7EC]" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="aspect-[4/3] rounded-md bg-[#EEF2F6]" />
              <div className="space-y-1.5">
                <div className="h-2 w-full rounded-full bg-[#E4E7EC]" />
                <div className="h-2 w-[88%] rounded-full bg-[#E4E7EC]" />
                <div className="h-2 w-[72%] rounded-full bg-[#E4E7EC]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

SlideThumbnailCardInner.displayName = "SlideThumbnailCard";

export const SlideThumbnailCard = memo(SlideThumbnailCardInner);

