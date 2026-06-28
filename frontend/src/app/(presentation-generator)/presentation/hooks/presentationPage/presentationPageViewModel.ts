import type { MutableRefObject } from "react";
import type { PresentationData } from "@/store/slices/presentationGeneration";
import type { Slide } from "../../../types/slide";
import type { Theme } from "../../../services/api/types";
import type { ChatProps } from "../../components/chat/Chat.types";
import type { PresentationModeProps } from "../../components/PresentationMode";
import type { PresentationEditorViewProps } from "../../components/presentation-page/PresentationEditorView";
import type { PresentationErrorStateProps } from "../../components/presentation-page/PresentationErrorState";
import type {
  PresentationSlidesVirtualizer,
} from "../../components/presentation-page/PresentationSlidesViewport";
import type { StreamLoadingState } from "../presentationStreaming/shared";
import type { SlideScrollBehavior } from "../usePresentationSlidesViewport";

export type PresentationPageState = {
  hasPresentationData: boolean;
  slides: Slide[];
  slidesLength: number;
  presentationTheme?: Theme | null;
};

export const derivePresentationPageState = (
  presentationData: PresentationData | null
): PresentationPageState => {
  const slides = Array.isArray(presentationData?.slides)
    ? (presentationData.slides as Slide[])
    : [];

  return {
    hasPresentationData: Boolean(presentationData),
    slides,
    slidesLength: slides.length,
    presentationTheme: presentationData?.theme,
  };
};

type BuildPresentModePropsOptions = {
  pageState: PresentationPageState;
  currentSlide: number;
  isFullscreen: boolean;
  onFullscreenToggle: PresentationModeProps["onFullscreenToggle"];
  onExit: PresentationModeProps["onExit"];
  onSlideChange: PresentationModeProps["onSlideChange"];
};

export const buildPresentModeProps = ({
  pageState,
  currentSlide,
  isFullscreen,
  onFullscreenToggle,
  onExit,
  onSlideChange,
}: BuildPresentModePropsOptions): PresentationModeProps => ({
  slides: pageState.slides,
  currentSlide,
  theme: pageState.presentationTheme ?? undefined,
  isFullscreen,
  onFullscreenToggle,
  onExit,
  onSlideChange,
});

type BuildErrorStatePropsOptions = {
  onRefresh: () => void;
  onGoToUpload: () => void;
};

export const buildErrorStateProps = ({
  onRefresh,
  onGoToUpload,
}: BuildErrorStatePropsOptions): PresentationErrorStateProps => ({
  onRefresh,
  onGoToUpload,
});

type BuildEditorViewPropsOptions = {
  presentationId: string;
  loading: boolean;
  isSaving: boolean;
  selectedSlide: number;
  pageState: PresentationPageState;
  stream: string | null;
  loadingState: StreamLoadingState;
  slidesScrollContainerRef: MutableRefObject<HTMLDivElement | null>;
  slidesVirtualizer: PresentationSlidesVirtualizer;
  highlightedSlideIndex: number | null;
  isChatSending: boolean;
  targetedSlidesSet: Set<number>;
  onSlideSelect: (index: number, behavior?: SlideScrollBehavior) => void;
  onPresentationChanged: NonNullable<ChatProps["onPresentationChanged"]>;
  onChatSendingStateChange: NonNullable<ChatProps["onChatSendingStateChange"]>;
  onFollowModeChange: NonNullable<ChatProps["onFollowModeChange"]>;
  onAgentSlideFocus: NonNullable<ChatProps["onAgentSlideFocus"]>;
};

export const buildEditorViewProps = ({
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
  onSlideSelect,
  onPresentationChanged,
  onChatSendingStateChange,
  onFollowModeChange,
  onAgentSlideFocus,
}: BuildEditorViewPropsOptions): PresentationEditorViewProps => ({
  header: {
    presentationId,
    isSaving,
    selectedSlide,
  },
  sidePanel: {
    presentationId,
    loading,
    selectedSlide,
    onSlideSelect,
  },
  slidesViewport: {
    presentationId,
    loading,
    hasPresentationData: pageState.hasPresentationData,
    stream,
    loadingState,
    slides: pageState.slides,
    slidesScrollContainerRef,
    slidesVirtualizer,
    highlightedSlideIndex,
    isChatSending,
    targetedSlidesSet,
  },
  chat: {
    presentationId,
    currentSlide: selectedSlide,
    onPresentationChanged,
    onChatSendingStateChange,
    onFollowModeChange,
    onAgentSlideFocus,
  },
});

