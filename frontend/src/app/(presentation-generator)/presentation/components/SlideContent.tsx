import React, { memo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  PlusIcon,
  Pencil,
  Trash,
  Sparkles,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { SendHorizontal } from "lucide-react";
import { notify } from "@/components/ui/sonner";
import { PresentationGenerationApi } from "../../services/api/presentation-generation";
import ToolTip from "@/components/ToolTip";
import { RootState } from "@/store/store";
import { store } from "@/store/store";
import { useDispatch, useSelector } from "react-redux";
import {
  deletePresentationSlide,
  updateSlide,
} from "@/store/slices/presentationGeneration";
import { usePathname } from "next/navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import { addToHistory } from "@/store/slices/undoRedoSlice";
import NewSlide from "./NewSlide";
import SlideScale from "../../components/PresentationRender";

interface SlideContentProps {
  slide: any;
  index: number;
  presentationId: string;
  isChatEditing?: boolean;
  isChatTargeted?: boolean;
}

const SlideContent = ({
  slide,
  index,
  presentationId,
  isChatEditing = false,
  isChatTargeted = false,
}: SlideContentProps) => {
  const dispatch = useDispatch();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showNewSlideSelection, setShowNewSlideSelection] = useState(false);
  const [isEditPopoverOpen, setIsEditPopoverOpen] = useState(false);
  const [isSpeakerPopoverOpen, setIsSpeakerPopoverOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const isStreaming = useSelector(
    (state: RootState) => Boolean(state.presentationGeneration.isStreaming)
  );
  const presentationTheme = useSelector(
    (state: RootState) => state.presentationGeneration.presentationData?.theme
  );

  // Use the centralized group layouts hook

  const pathname = usePathname();

  const handleSubmit = async () => {
    if (!editPrompt.trim()) {
      notify.warning(
        "Prompt required",
        "Please enter a prompt before submitting."
      );
      return;
    }
    setIsUpdating(true);

    try {
      const response = await PresentationGenerationApi.editSlide(
        slide.id,
        editPrompt
      );

      if (response) {
        dispatch(updateSlide({ index: slide.index, slide: response }));
        trackEvent(MixpanelEvent.Presentation_Slide_Updated, {
          pathname,
          presentation_id: presentationId,
          slide_id: slide.id,
          slide_index: slide.index,
          layout: slide.layout,
          prompt_char_count: editPrompt.trim().length,
          prompt_word_count: editPrompt.trim().split(/\s+/).filter(Boolean)
            .length,
        });
        notify.success(
          "Slide updated",
          "Your changes were applied to this slide."
        );
        setEditPrompt("");
      } else {
        notify.error(
          "Slide edit failed",
          "The server did not return an updated slide. Please try again."
        );
      }
    } catch (error: any) {
      console.error("Error in slide editing:", error);
      notify.error(
        "Slide edit failed",
        error.message || "Something went wrong while editing the slide."
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const onDeleteSlide = async () => {
    try {
      const currentSlides =
        store.getState().presentationGeneration.presentationData?.slides ?? [];

      if (currentSlides.length <= 1) {
        notify.warning(
          "Cannot delete slide",
          "A presentation must contain at least one slide."
        );
        return;
      }

      trackEvent(MixpanelEvent.Presentation_Slide_Deleted, {
        pathname,
        presentation_id: presentationId,
        slide_id: slide.id,
        slide_index: slide.index,
        layout: slide.layout,
      });
      // Add current state to past
      dispatch(
        addToHistory({
          slides: currentSlides,
          actionType: "DELETE_SLIDE",
        })
      );
      dispatch(deletePresentationSlide(slide.index));
    } catch (error: any) {
      console.error("Error deleting slide:", error);
      notify.error(
        "Could not delete slide",
        error.message || "Something went wrong while deleting the slide."
      );
    }
  };

  const overlayRoot =
    typeof document !== "undefined"
      ? document.getElementById("presentation-editor-overlay-root")
      : null;

  const slideLayoutTemplateId = `${slide.layout.split(":")[0]}`;

  const newSlideOverlay =
    overlayRoot
      ? createPortal(
          <AnimatePresence>
            {showNewSlideSelection && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="absolute inset-0 overflow-y-auto pointer-events-auto"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute inset-0 bg-[rgba(237,238,239,0.34)] backdrop-blur-[10px]"
                  onClick={() => setShowNewSlideSelection(false)}
                />
                <div className="pointer-events-none relative flex min-h-full items-start justify-center px-6 py-10 xl:px-8 xl:py-12">
                  <motion.div
                    initial={{ opacity: 0, y: 22, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.992 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="pointer-events-auto w-full max-w-[920px]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <NewSlide
                      index={index}
                      templateID={slideLayoutTemplateId}
                      setShowNewSlideSelection={setShowNewSlideSelection}
                      presentationId={presentationId}
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          overlayRoot
        )
      : null;

  return (
    <>
      <div
        id={`slide-${slide.index}`}
        className={`main-slide relative flex w-full items-center justify-center max-md:mb-4 ${
          isChatTargeted ? "opacity-95" : ""
        }`}
      >
        {isStreaming && (
          <Loader2 className="w-8 h-8 absolute right-2 top-2 z-30 text-blue-800 animate-spin" />
        )}
        <div
          data-layout={slide.layout}
          data-group={slide.layout_group}
          className={` w-full  group font-syne  `}
        >
          {/* <V1ContentRender slide={slide} isEditMode={true} theme={null} /> */}
          {isChatEditing && (
            <div
              className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 overflow-hidden rounded-[50px]  p-[1.5px] font-syne"
              aria-live="polite"
            >
              <span className="relative z-20 flex items-center overflow-hidden rounded-[50px] bg-white px-3 py-2 text-sm font-medium text-[#666666]">
                <span
                  aria-hidden="true"
                  className="generating-slides-background absolute"
                />
                <span className="relative z-10 flex items-center  gap-2">
                  <Sparkles className="h-4 w-4 text-[#9034EA]" />
                  Updating slides...
                </span>
              </span>
            </div>
          )}
          <div className="relative">
            <SlideScale slide={slide} theme={presentationTheme || null} />
          </div>
          {!showNewSlideSelection && (
            <div className="group-hover:opacity-100 hidden md:block opacity-0 transition-opacity my-4 duration-300">
              <ToolTip content="Add new slide below">
                {!isStreaming && (
                  <div
                    onClick={() => {
                      setShowNewSlideSelection(true);
                    }}
                    className="  bg-white shadow-md w-[80px] py-2 border hover:border-[#5141e5] duration-300  flex items-center justify-center rounded-lg cursor-pointer mx-auto"
                  >
                    <PlusIcon className="text-gray-500 text-base cursor-pointer" />
                  </div>
                )}
              </ToolTip>
            </div>
          )}
          {newSlideOverlay}

          {!isStreaming && (
            <div
              className={`absolute right-3 top-3 z-30 hidden md:flex flex-row items-center gap-2 rounded-[28px] border border-gray-200/80 bg-white/95 px-2.5 py-2 ${
                isEditPopoverOpen || isSpeakerPopoverOpen
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
              }`}
              style={{
                boxShadow: "0 2px 10px 0 rgba(15, 23, 42, 0.08)",
              }}
            >
              <Popover
                open={isEditPopoverOpen}
                onOpenChange={setIsEditPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex px-3.5 py-2.5 items-center justify-center rounded-full bg-[#F7F6F9] font-syne"
                  >
                    <ToolTip content="Update slide using prompt">
                      <Pencil className="h-4 w-4" />
                    </ToolTip>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="center"
                  sideOffset={12}
                  className="z-30 w-[340px] rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl font-syne"
                >
                  <div className="border-b border-gray-100 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">
                      Update slide
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Describe how this slide should be improved.
                    </p>
                  </div>
                  <form
                    className="flex flex-col gap-3 p-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSubmit();
                    }}
                  >
                    <Textarea
                      id={`slide-${slide.index}-prompt`}
                      value={editPrompt}
                      placeholder="Enter your prompt here..."
                      className="min-h-[110px] max-h-[180px] w-full resize-none rounded-xl border border-gray-200 p-3 text-sm focus-visible:ring-1 focus-visible:ring-[#5141e5]"
                      disabled={isUpdating}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || e.shiftKey || isUpdating)
                          return;
                        e.preventDefault();
                        handleSubmit();
                      }}
                      rows={5}
                      wrap="soft"
                    />
                    <button
                      disabled={isUpdating}
                      type="submit"
                      className={`ml-auto flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#9034EA] to-[#5146E5] px-4 py-2 text-sm font-medium text-white transition-opacity ${
                        isUpdating
                          ? "cursor-not-allowed opacity-70"
                          : "hover:opacity-90"
                      }`}
                    >
                      {isUpdating ? "Updating..." : "Update"}
                      <SendHorizontal className="h-4 w-4" />
                    </button>
                  </form>
                </PopoverContent>
              </Popover>

              {slide?.speaker_note && (
                <Popover
                  open={isSpeakerPopoverOpen}
                  onOpenChange={setIsSpeakerPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      style={{
                        background:
                          "linear-gradient(270deg, #D5CAFC 2.4%, #E3D2EB 27.88%, #F4DCD3 69.23%, #FDE4C2 100%)",
                      }}
                      className={`flex px-4 py-2.5 items-center justify-center rounded-full border font-syne ${
                        slide?.speaker_note
                          ? "border-violet-200 bg-violet-50 text-violet-700"
                          : "border-gray-200 bg-white text-gray-600"
                      }`}
                    >
                      <ToolTip content="Edit speaker notes">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                        >
                          <path
                            d="M5.13334 11.6665V9.27482L6.24167 9.39149C6.56434 9.37356 6.86969 9.23977 7.1016 9.01472C7.33351 8.78966 7.4764 8.48847 7.50401 8.16649V4.84149C7.50787 4.0011 7.17774 3.1936 6.58624 2.59663C5.99473 1.99965 5.1903 1.6621 4.34992 1.65824C3.50954 1.65437 2.70204 1.9845 2.10506 2.57601C1.50809 3.16751 1.17054 3.97194 1.16667 4.81232C1.16667 6.44565 1.54934 6.59382 1.75001 7.46649C1.88562 7.99351 1.89143 8.54556 1.76692 9.07532L1.16667 11.6665"
                            stroke="black"
                            strokeWidth="1.16667"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M11.55 10.3833C12.3701 9.56317 12.8309 8.45095 12.8312 7.29115C12.8316 6.13134 12.3714 5.01886 11.5518 4.19824"
                            stroke="black"
                            strokeWidth="1.16667"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9.91667 8.74974C10.1075 8.55893 10.2586 8.33217 10.3613 8.08258C10.464 7.83299 10.5161 7.56553 10.5148 7.29566C10.5134 7.02578 10.4586 6.75885 10.3534 6.51031C10.2482 6.26177 10.0948 6.03654 9.90208 5.84766"
                            stroke="black"
                            strokeWidth="1.16667"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </ToolTip>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="bottom"
                    align="center"
                    sideOffset={12}
                    className="z-30 w-[340px] rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl font-syne"
                  >
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Speaker notes
                      </p>
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="max-h-[220px] min-h-[100px] overflow-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
                        {slide?.speaker_note?.trim()}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              <button
                type="button"
                onClick={onDeleteSlide}
                className="flex px-4 py-2.5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 font-syne"
              >
                <ToolTip content="Delete slide">
                  <Trash className="h-4 w-4" />
                </ToolTip>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const areSlideContentPropsEqual = (
  previousProps: SlideContentProps,
  nextProps: SlideContentProps
) =>
  previousProps.slide === nextProps.slide &&
  previousProps.index === nextProps.index &&
  previousProps.presentationId === nextProps.presentationId &&
  previousProps.isChatEditing === nextProps.isChatEditing &&
  previousProps.isChatTargeted === nextProps.isChatTargeted;

export default memo(SlideContent, areSlideContentPropsEqual);

