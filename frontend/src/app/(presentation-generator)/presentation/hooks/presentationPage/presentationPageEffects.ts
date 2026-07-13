import { useEffect, useLayoutEffect } from "react";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import type { Theme } from "../../../services/api/types";
import { applyPresentationThemeToElement } from "../../utils/applyPresentationThemeDom";

type UsePresentationEditorViewedTrackingOptions = {
  pathname: string;
  presentationId: string;
  stream: string | null;
  isPresentMode: boolean;
};

export const usePresentationEditorViewedTracking = ({
  pathname,
  presentationId,
  stream,
  isPresentMode,
}: UsePresentationEditorViewedTrackingOptions) => {
  useEffect(() => {
    trackEvent(MixpanelEvent.Presentation_Editor_Viewed, {
      pathname,
      presentation_id: presentationId,
      stream_mode: !!stream,
      presentation_mode: isPresentMode ? "present" : "edit",
    });
  }, [pathname, presentationId, stream, isPresentMode]);
};

type UsePresentationThemeSyncOptions = {
  isPresentMode: boolean;
  presentationTheme?: Theme | null;
};

export const usePresentationThemeSync = ({
  isPresentMode,
  presentationTheme,
}: UsePresentationThemeSyncOptions) => {
  useLayoutEffect(() => {
    if (isPresentMode || !presentationTheme) return;
    const el = document.getElementById("presentation-slides-wrapper");
    applyPresentationThemeToElement(el, presentationTheme);
  }, [isPresentMode, presentationTheme]);
};

