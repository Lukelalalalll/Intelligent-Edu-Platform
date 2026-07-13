import { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useFontLoader as loadFontsForExport } from "@/app/(presentation-generator)/hooks/useFontLoad";
import { DashboardApi } from "@/app/(presentation-generator)/services/api/dashboard";
import { notify } from "@/components/ui/sonner";
import { setPresentationData } from "@/store/slices/presentationGeneration";
import { RootState } from "@/store/store";
import { normalizeBackendAssetUrls } from "@/utils/api";

import {
  collectThemeWarningMessages,
  fetchPresentationForExport,
  getExportCookieFromHash,
  getFontWarningMessages,
} from "./pdfMakerDataHelpers";

type UsePdfMakerDataArgs = {
  presentationId: string;
  exportCookie?: string;
};

export const usePdfMakerData = ({
  presentationId,
  exportCookie,
}: UsePdfMakerDataArgs) => {
  const [contentLoading, setContentLoading] = useState(true);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const effectiveExportCookie = exportCookie ?? getExportCookieFromHash();

  const dispatch = useDispatch();
  const { presentationData } = useSelector(
    (state: RootState) => state.presentationGeneration
  );

  const fetchUserSlides = useCallback(async () => {
    setContentLoading(true);
    setError(false);

    try {
      const nextValidationMessages = new Set<string>();
      const data = effectiveExportCookie
        ? await fetchPresentationForExport(presentationId, effectiveExportCookie)
        : await DashboardApi.getPresentation(presentationId);
      const normalizedData = normalizeBackendAssetUrls(data);

      if (normalizedData.fonts) {
        getFontWarningMessages(loadFontsForExport(normalizedData.fonts)).forEach(
          (message) => nextValidationMessages.add(message)
        );
      }

      dispatch(setPresentationData(normalizedData));

      if (normalizedData?.theme) {
        try {
          collectThemeWarningMessages(normalizedData.theme).forEach((message) =>
            nextValidationMessages.add(message)
          );
        } catch (themeError) {
          nextValidationMessages.add(
            "Theme styling could not be fully applied. Export will continue with default styling where needed."
          );
          console.warn("Theme application skipped for pdf-maker:", themeError);
        }
      }

      const warningMessages = Array.from(nextValidationMessages);
      setValidationMessages(warningMessages);
      warningMessages.forEach((message) => {
        notify.warning("Export rendering adjusted", message);
      });
    } catch (error) {
      setError(true);
      setValidationMessages([]);
      notify.error(
        "Failed to load presentation",
        "The presentation could not be loaded. Please try again."
      );
      console.error("Error fetching user slides:", error);
    } finally {
      setContentLoading(false);
    }
  }, [dispatch, effectiveExportCookie, presentationId]);

  useEffect(() => {
    void fetchUserSlides();
  }, [fetchUserSlides]);

  const slides = presentationData?.slides ?? [];
  const isLoading = contentLoading || (!error && slides.length === 0);

  return {
    error,
    isLoading,
    presentationData,
    slides,
    validationMessages,
  };
};
