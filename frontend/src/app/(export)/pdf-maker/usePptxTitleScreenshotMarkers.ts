import { useEffect } from "react";

import {
  clearPptxTitleScreenshotMarkers,
  isPptxExportRuntime,
  markPptxTitleBlocksForScreenshot,
} from "./pptxTitleScreenshotMarkers";

type UsePptxTitleScreenshotMarkersArgs = {
  isLoading: boolean;
  slides: unknown[];
};

export const usePptxTitleScreenshotMarkers = ({
  isLoading,
  slides,
}: UsePptxTitleScreenshotMarkersArgs) => {
  useEffect(() => {
    if (!isPptxExportRuntime() || isLoading) {
      return;
    }

    const wrapper = document.getElementById("presentation-slides-wrapper");
    if (!wrapper) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      void markPptxTitleBlocksForScreenshot(wrapper);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      clearPptxTitleScreenshotMarkers(wrapper);
    };
  }, [isLoading, slides]);
};
