"use client";
import React, {
  useEffect,
  useState,
  memo,
  useCallback,
  useRef,
} from "react";
import { useDispatch } from "react-redux";
import { addNewSlide } from "@/store/slices/presentationGeneration";
import { Loader2, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { notify } from "@/components/ui/sonner";
import { getCustomTemplateDetails } from "@/app/hooks/useCustomTemplates";
import { getTemplatesByTemplateName } from "@/app/presentation-templates";
import { usePathname } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";

interface LayoutItemProps {
  layout: any;
  onSelect: (sampleData: any, layoutId: string) => void;
  renderPreview: boolean;
}

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;
const PROJECT_UI_FONT_STACK =
  '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif';
const layoutCache = new Map<string, any[]>();

const LayoutItem = memo(({ layout, onSelect, renderPreview }: LayoutItemProps) => {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);
  const {
    component: LayoutComponent,
    sampleData,
    layoutId,
    layoutName,
  } = layout;

  useEffect(() => {
    if (!renderPreview || !previewRef.current) return;

    const previewElement = previewRef.current;
    const updateScale = () => {
      const nextScale = Math.min(
        previewElement.clientWidth / PREVIEW_WIDTH,
        previewElement.clientHeight / PREVIEW_HEIGHT
      );
      setScale(nextScale || 0.2);
    };

    const resizeObserver = new ResizeObserver(updateScale);
    resizeObserver.observe(previewElement);
    updateScale();

    return () => resizeObserver.disconnect();
  }, [renderPreview]);

  const selectLayout = () => onSelect(sampleData, layoutId);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Add ${layoutName || "slide"} layout`}
      title={layoutName || "Slide layout"}
      onClick={selectLayout}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectLayout();
      }}
      className="relative aspect-video cursor-pointer overflow-hidden rounded-[14px] border border-[#E4E4EA] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] outline-none transition duration-200 hover:-translate-y-[1px] hover:border-[#7C51F8] hover:shadow-[0_0_0_2px_rgba(124,81,248,0.14),0_18px_32px_rgba(124,81,248,0.08)] focus-visible:ring-2 focus-visible:ring-[#7C51F8]"
      aria-busy={!renderPreview}
      style={{ contain: "layout paint style" }}
    >
      <div className="absolute inset-0 z-40 bg-transparent" />
      <div ref={previewRef} className="relative h-full w-full overflow-hidden">
        {renderPreview ? (
          <div
            className="absolute left-0 top-0"
            style={{
              width: PREVIEW_WIDTH,
              height: PREVIEW_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            <LayoutComponent data={sampleData} />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col justify-between bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] p-4">
            <div className="space-y-2">
              <div className="h-3 w-[52%] rounded-full bg-[#D8DCE6]" />
              <div className="h-2.5 w-[76%] rounded-full bg-[#E7EAF1]" />
            </div>
            <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
              <div className="aspect-[4/3] rounded-[10px] bg-[#EEF2F6]" />
              <div className="space-y-2">
                <div className="h-2.5 w-full rounded-full bg-[#E7EAF1]" />
                <div className="h-2.5 w-[82%] rounded-full bg-[#E7EAF1]" />
                <div className="h-2.5 w-[58%] rounded-full bg-[#E7EAF1]" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

LayoutItem.displayName = "LayoutItem";
interface NewSlideV1Props {
  setShowNewSlideSelection: (show: boolean) => void;
  templateID: string;
  index: number;
  presentationId: string;
}
const NewSlideV1 = ({
  setShowNewSlideSelection,
  templateID,
  index,
  presentationId,
}: NewSlideV1Props) => {
  const dispatch = useDispatch();
  const pathname = usePathname();
  const [layouts, setLayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [renderPreviews, setRenderPreviews] = useState(false);

  const isCustomTemplate = templateID.startsWith("custom-");
  const cacheKey = `${isCustomTemplate ? "custom" : "builtin"}:${templateID}`;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowNewSlideSelection(false);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [setShowNewSlideSelection]);

  const handleNewSlide = useCallback(
    (sampleData: any, id: string) => {
      try {
        const newSlide = {
          id: uuidv4(),
          index: index,
          content: sampleData,
          layout_group: templateID,
          layout: isCustomTemplate ? `${templateID}:${id}` : id,
          presentation: presentationId,
        };
        dispatch(addNewSlide({ slideData: newSlide, index }));
        trackEvent(MixpanelEvent.Presentation_Slide_Added, {
          pathname,
          presentation_id: presentationId,
          inserted_after_index: index,
          template_id: templateID,
          layout_id: id,
          is_custom_template: isCustomTemplate,
        });
        setShowNewSlideSelection(false);
      } catch (error: any) {
        console.error(error);
        notify.error("Could not add slide", "Something went wrong while adding the new slide.");
      }
    },
    [
      index,
      templateID,
      presentationId,
      dispatch,
      setShowNewSlideSelection,
      isCustomTemplate,
      pathname,
    ]
  );

  useEffect(() => {
    let isMounted = true;

    const fetchLayouts = async () => {
      const cachedLayouts = layoutCache.get(cacheKey);
      if (cachedLayouts) {
        setLayouts(cachedLayouts);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        if (isCustomTemplate) {
          const customTemplateId = templateID.split("custom-")[1];
          const templateDetails = await getCustomTemplateDetails(
            customTemplateId,
            "Custom Template",
            "User-created template"
          );
          const nextLayouts = templateDetails?.layouts || [];
          layoutCache.set(cacheKey, nextLayouts);
          if (isMounted) setLayouts(nextLayouts);
        } else {
          const templateDetails = getTemplatesByTemplateName(templateID);
          const nextLayouts = templateDetails || [];
          layoutCache.set(cacheKey, nextLayouts);
          if (isMounted) setLayouts(nextLayouts);
        }
      } catch (error) {
        console.error("Error loading slide layouts:", error);
        if (isMounted) setLayouts([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLayouts();

    return () => {
      isMounted = false;
    };
  }, [cacheKey, isCustomTemplate, templateID]);

  useEffect(() => {
    setRenderPreviews(false);

    if (loading || layouts.length === 0) {
      return;
    }

    let frameA: number | null = null;
    let frameB: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const commitPreviewRender = () => {
      timeoutId = window.setTimeout(() => {
        setRenderPreviews(true);
      }, 24);
    };

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(commitPreviewRender);
    });

    return () => {
      if (frameA !== null) {
        window.cancelAnimationFrame(frameA);
      }
      if (frameB !== null) {
        window.cancelAnimationFrame(frameB);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [layouts, loading]);

  const layoutCountText = `${layouts.length} Layout${
    layouts.length === 1 ? "" : "s"
  }`;


  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="choose-slide-layout-title"
      className="relative w-full overflow-hidden rounded-[24px] border border-white/70 bg-[rgba(255,255,255,0.96)] shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl"
      style={{ fontFamily: PROJECT_UI_FONT_STACK }}
    >
      <button
        type="button"
        aria-label="Close layout picker"
        onClick={() => setShowNewSlideSelection(false)}
        className="absolute right-5 top-5 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-[#ECEAF3] bg-white/92 text-[#191919] shadow-[0_10px_30px_rgba(15,23,42,0.10)] transition hover:bg-[#F7F6F9]"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex min-h-[92px] items-start justify-between border-b border-[#EDEEEF] px-6 py-5 md:px-7">
        <div className="pr-12">
          <h2
            id="choose-slide-layout-title"
            className="text-[28px] font-medium leading-[1.15] text-[#191919]"
          >
            Choose Slide Layout
          </h2>
          <p className="mt-2 text-sm font-normal leading-relaxed text-[#6F7281]">
            Pick a layout to insert right after this slide.
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-[#8D8D99]">
            {loading ? "Loading layouts" : layoutCountText}
          </p>
        </div>
        {loading && (
          <Loader2 className="mt-1 h-5 w-5 animate-spin text-[#7C51F8]" />
        )}
      </div>

      <div className="max-h-[min(72vh,680px)] overflow-y-auto px-5 py-5 md:px-6">
        {loading ? (
          <div className="flex h-56 items-center justify-center rounded-[18px] bg-[#FAFAFC]">
            <Loader2 className="h-8 w-8 animate-spin text-[#7C51F8]" />
          </div>
        ) : layouts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {layouts.map((layout: any) => (
                <LayoutItem
                  key={layout.layoutId}
                  layout={layout}
                  onSelect={handleNewSlide}
                  renderPreview={renderPreviews}
                />
              ))}
            </div>
        ) : (
          <div className="flex h-56 items-center justify-center rounded-[18px] border border-dashed border-[#D9D9E1] bg-[#FAFAFB] text-sm text-[#7A7A85]">
            No layouts available.
          </div>
        )}
      </div>
    </div>
  );
};

export default NewSlideV1;
