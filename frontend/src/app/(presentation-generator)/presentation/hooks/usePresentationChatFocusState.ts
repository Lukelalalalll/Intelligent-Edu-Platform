import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentSlideFocusPayload } from "../components/chat/Chat.types";
import type { SlideScrollBehavior } from "./usePresentationSlidesViewport";

type UsePresentationChatFocusStateOptions = {
  selectedSlide: number;
  totalSlides: number;
  onSlideSelect: (index: number, behavior?: SlideScrollBehavior) => void;
};

export const usePresentationChatFocusState = ({
  selectedSlide,
  totalSlides,
  onSlideSelect,
}: UsePresentationChatFocusStateOptions) => {
  const [isChatSending, setIsChatSending] = useState(false);
  const [isFollowModeEnabled, setIsFollowModeEnabled] = useState(true);
  const [agentFocusedSlide, setAgentFocusedSlide] = useState<number | null>(
    null
  );
  const [agentFocusEventId, setAgentFocusEventId] = useState<string | null>(
    null
  );
  const [glowingSlideIndex, setGlowingSlideIndex] = useState<number | null>(
    null
  );
  const [chatTargetedSlides, setChatTargetedSlides] = useState<number[]>([]);

  const handleFollowModeChange = useCallback((isEnabled: boolean) => {
    setIsFollowModeEnabled(isEnabled);
  }, []);

  const handleChatSendingStateChange = useCallback((sending: boolean) => {
    setIsChatSending(sending);
    if (sending) {
      setGlowingSlideIndex(null);
      setChatTargetedSlides((previous) =>
        previous.length === 0 ? previous : []
      );
      return;
    }

    setAgentFocusedSlide(null);
    setAgentFocusEventId(null);
  }, []);

  const handleAgentSlideFocus = useCallback(
    ({ slideIndex, eventId }: AgentSlideFocusPayload) => {
      if (slideIndex < 0) {
        return;
      }

      const clampedIndex =
        totalSlides > 0 ? Math.min(Math.max(slideIndex, 0), totalSlides - 1) : null;

      setAgentFocusedSlide(slideIndex);
      setAgentFocusEventId(eventId);
      setGlowingSlideIndex(clampedIndex);
      setChatTargetedSlides((previous) =>
        previous.includes(slideIndex) ? previous : [...previous, slideIndex]
      );
    },
    [totalSlides]
  );

  const targetedSlidesSet = useMemo(
    () => new Set(chatTargetedSlides),
    [chatTargetedSlides]
  );

  useEffect(() => {
    if (!isFollowModeEnabled || !isChatSending || totalSlides <= 0) {
      return;
    }
    if (agentFocusedSlide === null) {
      return;
    }

    const clampedIndex = Math.min(
      Math.max(agentFocusedSlide, 0),
      totalSlides - 1
    );

    if (clampedIndex !== selectedSlide) {
      onSlideSelect(clampedIndex, "auto");
    }
  }, [
    agentFocusEventId,
    agentFocusedSlide,
    isChatSending,
    isFollowModeEnabled,
    onSlideSelect,
    selectedSlide,
    totalSlides,
  ]);

  useEffect(() => {
    if (totalSlides > 0) {
      return;
    }

    if (glowingSlideIndex === null && chatTargetedSlides.length === 0) {
      return;
    }

    const clearTimer = window.setTimeout(() => {
      setGlowingSlideIndex(null);
      setChatTargetedSlides([]);
    }, 0);

    return () => window.clearTimeout(clearTimer);
  }, [
    chatTargetedSlides.length,
    glowingSlideIndex,
    totalSlides,
  ]);

  useEffect(() => {
    if (isChatSending) {
      return;
    }
    if (glowingSlideIndex === null && chatTargetedSlides.length === 0) {
      return;
    }

    const clearTimer = window.setTimeout(() => {
      setGlowingSlideIndex(null);
      setChatTargetedSlides([]);
    }, 900);

    return () => window.clearTimeout(clearTimer);
  }, [chatTargetedSlides.length, glowingSlideIndex, isChatSending]);

  return {
    isChatSending,
    highlightedSlideIndex: glowingSlideIndex,
    targetedSlidesSet,
    handleAgentSlideFocus,
    handleChatSendingStateChange,
    handleFollowModeChange,
  };
};

