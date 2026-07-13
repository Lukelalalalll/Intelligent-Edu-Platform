"use client";
import React, { useCallback } from "react";

import "@/app/(presentation-generator)/utils/prism-languages";
import { usePathname } from "@/ppt_generator/shims/next-navigation";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";

import {
  ExportRuntimeAlert,
  ExportSlidesStack,
  PdfMakerErrorState,
  SlidesLoadingSkeleton,
} from "./PdfMakerPageStates";
import { PDF_PRINT_STYLE } from "./pdfMakerPrintStyles";
import { usePdfMakerData } from "./usePdfMakerData";
import { usePptxTitleScreenshotMarkers } from "./usePptxTitleScreenshotMarkers";

type PresentationPageProps = {
  presentation_id: string;
  exportCookie?: string;
};

const PresentationPage = ({ presentation_id, exportCookie }: PresentationPageProps) => {
  const pathname = usePathname();
  const { error, isLoading, presentationData, slides, validationMessages } =
    usePdfMakerData({
      exportCookie,
      presentationId: presentation_id,
    });

  usePptxTitleScreenshotMarkers({ isLoading, slides });

  const handleRetry = useCallback(() => {
    trackEvent(MixpanelEvent.PdfMaker_Retry_Button_Clicked, { pathname });
    window.location.reload();
  }, [pathname]);

  return (
    <div className="m-0 flex flex-col overflow-visible p-0">
      {error ? (
        <PdfMakerErrorState onRetry={handleRetry} />
      ) : (
        <>
          <style>{PDF_PRINT_STYLE}</style>
          <ExportRuntimeAlert messages={validationMessages} />
          <div
            id="presentation-slides-wrapper"
            className="relative m-0 flex w-full flex-col items-center overflow-visible p-0"
          >
            {isLoading ? (
              <SlidesLoadingSkeleton />
            ) : (
              <ExportSlidesStack
                presentationData={presentationData}
                slides={slides}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PresentationPage;
