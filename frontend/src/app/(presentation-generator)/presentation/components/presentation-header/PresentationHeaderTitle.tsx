"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, X } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import ToolTip from "@/components/ToolTip";
import MarkdownRenderer from "@/components/MarkDownRender";
import { cn } from "@/lib/utils";
import { updateTitle } from "@/store/slices/presentationGeneration";
import { RootState } from "@/store/store";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";

type PresentationHeaderTitleProps = {
  presentationId: string;
};

const PresentationHeaderTitle = ({
  presentationId,
}: PresentationHeaderTitleProps) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleBlurIntentRef = useRef<"none" | "save" | "cancel">("none");

  const pathname = usePathname();
  const dispatch = useDispatch();
  const { presentationData, isStreaming } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const beginTitleEdit = () => {
    if (isStreaming || !presentationData) {
      return;
    }
    setDraftTitle(presentationData.title || "");
    setIsEditingTitle(true);
  };

  const commitTitleEdit = () => {
    if (!presentationData) {
      setIsEditingTitle(false);
      return;
    }

    const trimmed = draftTitle.trim();
    const next = trimmed || presentationData.title || "Presentation";
    if (next !== presentationData.title) {
      dispatch(updateTitle(next));
      trackEvent(MixpanelEvent.Presentation_Title_Updated, {
        pathname,
        presentation_id: presentationId,
        previous_title_length: (presentationData.title || "").length,
        next_title_length: next.length,
      });
    }

    setIsEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setDraftTitle(presentationData?.title || "");
    setIsEditingTitle(false);
  };

  const handleTitleBlur = () => {
    queueMicrotask(() => {
      const intent = titleBlurIntentRef.current;
      titleBlurIntentRef.current = "none";
      if (intent === "cancel" || intent === "save") {
        return;
      }
      commitTitleEdit();
    });
  };

  const onTitleSaveMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    titleBlurIntentRef.current = "save";
  };

  const onTitleCancelMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    titleBlurIntentRef.current = "cancel";
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleBlurIntentRef.current = "save";
      commitTitleEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      titleBlurIntentRef.current = "cancel";
      cancelTitleEdit();
    }
  };

  const titleBlock = (
    <div
      className={cn(
        "relative min-h-[44px] min-w-0 max-w-[min(640px,calc(100vw-12rem))] flex-1 transition-[box-shadow] duration-200",
        isEditingTitle && "relative z-[60]"
      )}
    >
      <button
        type="button"
        onClick={beginTitleEdit}
        disabled={isStreaming || !presentationData || isEditingTitle}
        className={cn(
          "group/title -mx-3 flex w-full min-w-0 items-center gap-2.5 rounded-[14px] px-3 py-2 text-left transition-colors",
          "hover:bg-[#F6F6F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5141e5] focus-visible:ring-offset-2",
          "disabled:opacity-100",
          isEditingTitle
            ? "pointer-events-none bg-white shadow-[0_12px_30px_rgba(17,3,31,0.08)]"
            : "disabled:pointer-events-none disabled:hover:bg-transparent"
        )}
      >
        <h2 className="w-[450px] min-w-0 flex-1 font-unbounded text-lg leading-snug text-[#101323]">
          <MarkdownRenderer
            content={presentationData?.title || "Presentation"}
            className="prose-headings:my-0 prose-p:my-0 mb-0 min-w-0 overflow-hidden text-ellipsis line-clamp-1 text-sm text-[#101323]"
          />
        </h2>
        {presentationData && !isStreaming && (
          <Pencil
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[#101323]/40 opacity-80 transition-all duration-200 group-hover/title:text-[#5141e5] group-hover/title:opacity-100 sm:opacity-0 sm:group-hover/title:opacity-100",
              isEditingTitle && "text-[#5141e5] opacity-100"
            )}
            aria-hidden
          />
        )}
      </button>
      <AnimatePresence>
        {isEditingTitle && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full mt-2 flex w-[min(520px,calc(100vw-5rem))] origin-top-left items-stretch gap-0.5 rounded-[18px] border border-[#E4E2EB] bg-white/98 py-1 pl-3.5 pr-1 shadow-[0_20px_45px_rgba(17,3,31,0.12)] ring-1 ring-[#5141e5]/10 backdrop-blur-xl"
          >
            <input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              placeholder="Presentation title"
              className="min-w-0 flex-1 border-0 bg-transparent py-2 pr-2 font-unbounded text-base leading-tight text-[#101323] placeholder:text-[#101323]/35 outline-none focus:ring-0"
              aria-label="Presentation title"
            />
            <div className="ml-0.5 flex shrink-0 items-center gap-0.5 border-l border-[#EDECEC] pl-1">
              <ToolTip content="Save / Enter">
                <button
                  type="button"
                  onMouseDown={onTitleSaveMouseDown}
                  onClick={commitTitleEdit}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5141e5] transition-colors hover:bg-[#5141e5]/10"
                  aria-label="Save title"
                >
                  <Check className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </ToolTip>
              <ToolTip content="Cancel / Esc">
                <button
                  type="button"
                  onMouseDown={onTitleCancelMouseDown}
                  onClick={cancelTitleEdit}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#101323]/55 transition-colors hover:bg-[#F6F6F9] hover:text-[#101323]"
                  aria-label="Cancel editing title"
                >
                  <X className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </ToolTip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (presentationData && !isStreaming && !isEditingTitle) {
    return <ToolTip content="Rename presentation">{titleBlock}</ToolTip>;
  }

  return titleBlock;
};

export default PresentationHeaderTitle;
