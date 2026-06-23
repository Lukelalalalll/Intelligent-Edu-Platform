"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Play, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";

import ToolTip from "@/components/ToolTip";
import { notify } from "@/components/ui/sonner";
import { Separator } from "@/components/ui/separator";
import { clearPresentationData } from "@/store/slices/presentationGeneration";
import { clearHistory } from "@/store/slices/undoRedoSlice";
import { RootState } from "@/store/store";
import { MixpanelEvent, trackEvent } from "@/utils/mixpanel";
import { DEFAULT_THEMES } from "@/app/(presentation-generator)/(workspace)/theme/components/ThemePanel/constants";

import ThemeSelector from "../ThemeSelector";
import { usePresentationUndoRedo } from "../../hooks/PresentationUndoRedo";
import { PresentationGenerationApi } from "../../../services/api/presentation-generation";
import { getHeader } from "../../../services/api/header";
import { presentonFetch } from "../../../services/api/presenton-fetch";
import ThemeApi from "../../../services/api/theme";
import { Theme } from "../../../services/api/types";
import PresentationHeaderExportMenu from "./PresentationHeaderExportMenu";
import PresentationHeaderRegenerateDialog from "./PresentationHeaderRegenerateDialog";
import {
  buildSafeExportFileName,
  downloadBackendAsset,
  readExportErrorMessage,
  type ExportFormat,
  type ExportResponsePayload,
} from "./presentationHeader.utils";

type PresentationHeaderActionsProps = {
  presentationId: string;
  isPresentationSaving: boolean;
  currentSlide?: number;
};

type ToolbarAction = {
  key: string;
  tooltip: string;
  icon: typeof RotateCcw;
  disabled?: boolean;
  onClick: () => void;
  separatorClassName?: string;
};

const EXPORT_MESSAGES: Record<
  ExportFormat,
  { loading: string; success: string; error: string }
> = {
  pdf: {
    loading: "Exporting PDF",
    success: "Your PDF file has been downloaded.",
    error: "We are having trouble exporting your presentation.",
  },
  pptx: {
    loading: "Exporting PPTX",
    success: "Your PPTX file has been downloaded.",
    error: "We are having trouble exporting your presentation.",
  },
};

const exportTitlePattern = (format: ExportFormat) =>
  new RegExp(`\\.${format}$`, "i");

const PresentationHeaderActions = ({
  presentationId,
  isPresentationSaving,
  currentSlide,
}: PresentationHeaderActionsProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [isRegenerateConfirmOpen, setIsRegenerateConfirmOpen] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const { presentationData, isStreaming } = useSelector(
    (state: RootState) => state.presentationGeneration
  );
  const { onUndo, onRedo, canUndo, canRedo } = usePresentationUndoRedo();

  useEffect(() => {
    const loadThemes = async () => {
      try {
        const [customThemes] = await Promise.all([ThemeApi.getThemes()]);
        setThemes([...customThemes, ...DEFAULT_THEMES]);
      } catch (error: unknown) {
        notify.error(
          "Could not load themes",
          error instanceof Error ? error.message : "Failed to load themes."
        );
      }
    };

    if (themes.length === 0) {
      loadThemes();
    }
  }, [themes.length]);

  const handleReGenerate = () => {
    setIsRegenerateConfirmOpen(false);
    dispatch(clearPresentationData());
    dispatch(clearHistory());
    trackEvent(MixpanelEvent.Presentation_Regenerated, {
      pathname,
      presentation_id: presentationId,
      slide_count: presentationData?.slides?.length || 0,
    });
    router.push(`/presentation?id=${presentationId}&stream=true`);
  };

  const handlePresent = useCallback(() => {
    const to = `?id=${presentationId}&mode=present&slide=${currentSlide || 0}`;
    trackEvent(MixpanelEvent.Presentation_Mode_Entered, {
      pathname,
      presentation_id: presentationId,
      slide_index: currentSlide || 0,
      slide_count: presentationData?.slides?.length || 0,
    });
    trackEvent(MixpanelEvent.Navigation, { from: pathname, to });
    router.push(to);
  }, [currentSlide, pathname, presentationData?.slides?.length, presentationId, router]);

  const runExport = async (format: ExportFormat) => {
    if (isStreaming) {
      return;
    }

    let exportToastId: string | number | undefined;
    const messages = EXPORT_MESSAGES[format];

    try {
      trackEvent(MixpanelEvent.Presentation_Export_Started, {
        pathname,
        presentation_id: presentationId,
        format,
        slide_count: presentationData?.slides?.length || 0,
      });
      exportToastId = notify.loading(
        messages.loading,
        "Your presentation is being exported. This may take a moment."
      );
      setIsExporting(true);

      await PresentationGenerationApi.updatePresentationContent(presentationData);

      const safeFileName = buildSafeExportFileName(
        presentationData?.title,
        format
      );
      const safeTitle = safeFileName.replace(exportTitlePattern(format), "");
      const response = await presentonFetch("/api/v1/app/export", {
        method: "POST",
        headers: {
          ...getHeader(),
          "x-presenton-web-origin": window.location.origin,
        },
        body: JSON.stringify({
          format,
          id: presentationId,
          title: safeTitle,
        }),
      });

      if (!response.ok) {
        throw new Error(await readExportErrorMessage(response, messages.error));
      }

      const exportPayload = (await response.json()) as ExportResponsePayload;
      const downloadPath = exportPayload.downloadUrl || exportPayload.path;
      if (!downloadPath) {
        throw new Error("No download URL returned from export");
      }

      downloadBackendAsset(downloadPath, safeFileName);
      notify.success("Export complete", messages.success, { id: exportToastId });
    } catch (error) {
      console.error("Export failed:", error);
      notify.error(
        "Export failed",
        error instanceof Error
          ? error.message
          : "We are having trouble exporting your presentation. Please try again.",
        exportToastId !== undefined ? { id: exportToastId } : undefined
      );
    } finally {
      setIsExporting(false);
    }
  };

  const toolbarActions = useMemo<ToolbarAction[]>(
    () => [
      {
        key: "regenerate",
        tooltip: "Regenerate Presentation",
        icon: RotateCcw,
        onClick: () => setIsRegenerateConfirmOpen(true),
        separatorClassName: "h-4",
      },
      {
        key: "undo",
        tooltip: "Undo",
        icon: Undo2,
        disabled: !canUndo,
        onClick: onUndo,
        separatorClassName: "h-4",
      },
      {
        key: "redo",
        tooltip: "Redo",
        icon: Redo2,
        disabled: !canRedo,
        onClick: onRedo,
        separatorClassName: "h-4 w-[2px]",
      },
      {
        key: "present",
        tooltip: "Present",
        icon: Play,
        disabled:
          isStreaming ||
          !presentationData?.slides ||
          presentationData?.slides.length === 0,
        onClick: handlePresent,
      },
    ],
    [canRedo, canUndo, handlePresent, isStreaming, onRedo, onUndo, presentationData]
  );

  return (
    <>
      <div className="flex items-center gap-2.5">
        {isPresentationSaving && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        )}

        {presentationData &&
          presentationData.slides &&
          !presentationData.slides[0].layout.includes("custom") && (
            <ThemeSelector
              current_theme={presentationData?.theme || {}}
              themes={themes}
            />
          )}

        <div className="flex h-[38px] items-center gap-2 rounded-[80px] border border-[#EDECEC] bg-[#F6F6F9] px-3.5">
          {toolbarActions.map((action, index) => (
            <Fragment key={action.key}>
              <ToolTip content={action.tooltip}>
                <button
                  type="button"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="group cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <action.icon className="h-3.5 w-3.5 text-[#101323] duration-300 group-hover:text-[#5141e5]" />
                </button>
              </ToolTip>
              {index < toolbarActions.length - 1 && action.separatorClassName && (
                <Separator
                  orientation="vertical"
                  className={action.separatorClassName}
                />
              )}
            </Fragment>
          ))}
        </div>

        <PresentationHeaderExportMenu
          isExporting={isExporting}
          isDisabled={isExporting || isStreaming === true}
          onExportPdf={() => runExport("pdf")}
          onExportPptx={() => runExport("pptx")}
        />
      </div>

      <PresentationHeaderRegenerateDialog
        open={isRegenerateConfirmOpen}
        onOpenChange={setIsRegenerateConfirmOpen}
        onConfirm={handleReGenerate}
      />
    </>
  );
};

export default PresentationHeaderActions;
