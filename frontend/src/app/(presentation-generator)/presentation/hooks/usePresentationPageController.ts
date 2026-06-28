import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { trackEvent, MixpanelEvent } from "@/utils/mixpanel";
import type { PresentationModeProps } from "../components/PresentationMode";
import type { PresentationEditorViewProps } from "../components/presentation-page/PresentationEditorView";
import type { PresentationErrorStateProps } from "../components/presentation-page/PresentationErrorState";
import {
  useAutoSave,
  usePresentationData,
  usePresentationNavigation,
  usePresentationStreaming,
} from ".";
import {
  usePresentationEditorViewedTracking,
  usePresentationThemeSync,
} from "./presentationPage/presentationPageEffects";
import {
  buildEditorViewProps,
  buildErrorStateProps,
  buildPresentModeProps,
  derivePresentationPageState,
} from "./presentationPage/presentationPageViewModel";
import { usePresentationChatFocusState } from "./usePresentationChatFocusState";
import { usePresentationSlidesViewport } from "./usePresentationSlidesViewport";

type PresentationPageController =
  | {
      mode: "present";
      presentModeProps: PresentationModeProps;
    }
  | {
      mode: "error";
      errorStateProps: PresentationErrorStateProps;
    }
  | {
      mode: "editor";
      editorViewProps: PresentationEditorViewProps;
    };

export const usePresentationPageController = (
  presentationId: string
): PresentationPageController => {
  const pathname = usePathname();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState(false);

  const presentationData = useSelector(
    (state: RootState) => state.presentationGeneration.presentationData
  );
  const isStreaming = useSelector(
    (state: RootState) => Boolean(state.presentationGeneration.isStreaming)
  );

  const pageState = useMemo(
    () => derivePresentationPageState(presentationData),
    [presentationData]
  );

  const { isSaving } = useAutoSave({
    debounceMs: 2000,
    enabled: !!presentationData && !isStreaming,
  });

  const { fetchUserSlides } = usePresentationData(
    presentationId,
    setLoading,
    setError
  );

  const {
    isPresentMode,
    stream,
    currentSlide: presentSlideFromUrl,
    handleSlideClick,
    toggleFullscreen,
    handlePresentExit,
    handleSlideChange,
  } = usePresentationNavigation(
    presentationId,
    selectedSlide,
    setSelectedSlide,
    setIsFullscreen
  );

  const { loadingState } = usePresentationStreaming(
    presentationId,
    stream,
    setLoading,
    setError,
    fetchUserSlides
  );

  const {
    slidesScrollContainerRef,
    slidesVirtualizer,
    handleEditorSlideSelect,
  } = usePresentationSlidesViewport({
    slides: pageState.slides,
    isStreaming,
    selectedSlide,
    onSlideClick: handleSlideClick,
    setSelectedSlide,
  });

  const {
    isChatSending,
    highlightedSlideIndex,
    targetedSlidesSet,
    handleAgentSlideFocus,
    handleChatSendingStateChange,
    handleFollowModeChange,
  } = usePresentationChatFocusState({
    selectedSlide,
    totalSlides: pageState.slidesLength,
    onSlideSelect: handleEditorSlideSelect,
  });

  usePresentationEditorViewedTracking({
    pathname,
    presentationId,
    stream,
    isPresentMode,
  });

  usePresentationThemeSync({
    isPresentMode,
    presentationTheme: pageState.presentationTheme,
  });

  const onSlideChange = useCallback(
    (newSlide: number) => {
      handleSlideChange(newSlide, pageState.slidesLength);
    },
    [handleSlideChange, pageState.slidesLength]
  );

  const handlePresentationChanged = useCallback(() => {
    return fetchUserSlides({ clearHistory: false }).then(() => undefined);
  }, [fetchUserSlides]);

  const handleRefreshPage = useCallback(() => {
    trackEvent(MixpanelEvent.PresentationPage_Refresh_Page_Button_Clicked, {
      pathname,
    });
    window.location.reload();
  }, [pathname]);

  const handleGoToUpload = useCallback(() => {
    trackEvent(MixpanelEvent.Navigation, {
      from: pathname,
      to: "/upload",
    });
    router.push("/upload");
  }, [pathname, router]);

  if (isPresentMode) {
    return {
      mode: "present",
      presentModeProps: buildPresentModeProps({
        pageState,
        currentSlide: presentSlideFromUrl,
        isFullscreen,
        onFullscreenToggle: toggleFullscreen,
        onExit: handlePresentExit,
        onSlideChange,
      }),
    };
  }

  if (error) {
    return {
      mode: "error",
      errorStateProps: buildErrorStateProps({
        onRefresh: handleRefreshPage,
        onGoToUpload: handleGoToUpload,
      }),
    };
  }

  return {
    mode: "editor",
    editorViewProps: buildEditorViewProps({
      presentationId,
      loading,
      isSaving,
      selectedSlide,
      pageState,
      stream,
      loadingState,
      slidesScrollContainerRef,
      slidesVirtualizer,
      highlightedSlideIndex,
      isChatSending,
      targetedSlidesSet,
      onSlideSelect: handleEditorSlideSelect,
      onPresentationChanged: handlePresentationChanged,
      onChatSendingStateChange: handleChatSendingStateChange,
      onFollowModeChange: handleFollowModeChange,
      onAgentSlideFocus: handleAgentSlideFocus,
    }),
  };
};

