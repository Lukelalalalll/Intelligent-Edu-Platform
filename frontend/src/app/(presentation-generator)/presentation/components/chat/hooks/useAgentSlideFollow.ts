import { useCallback, useEffect, useRef } from "react";
import type { ChatStreamTrace } from "../../../../services/api/chat";
import {
  MIN_SLIDE_FOCUS_DWELL_MS,
  MUTATING_TOOLS,
  SLIDE_FOCUS_STATUSES,
  SLIDE_FOCUS_TOOLS,
} from "../Chat.constants";
import { readTraceSlideIndex } from "../Chat.utils";
import type { AgentSlideFocusPayload } from "../Chat.types";

type UseAgentSlideFollowOptions = {
  onAgentSlideFocus?: (focus: AgentSlideFocusPayload) => void;
};

export const useAgentSlideFollow = ({
  onAgentSlideFocus,
}: UseAgentSlideFollowOptions) => {
  const lastFollowedTraceRef = useRef<string | null>(null);
  const focusEventSequenceRef = useRef(0);
  const activeFocusedSlideRef = useRef<number | null>(null);
  const pendingFocusTraceRef = useRef<ChatStreamTrace | null>(null);
  const lastFocusDispatchAtRef = useRef<number>(0);
  const focusDispatchTimerRef = useRef<number | null>(null);

  const resetFollowState = useCallback(() => {
    lastFollowedTraceRef.current = null;
    activeFocusedSlideRef.current = null;
    pendingFocusTraceRef.current = null;
    lastFocusDispatchAtRef.current = 0;

    if (focusDispatchTimerRef.current !== null) {
      window.clearTimeout(focusDispatchTimerRef.current);
      focusDispatchTimerRef.current = null;
    }
  }, []);

  const emitAgentSlideFocus = useCallback(
    (trace: ChatStreamTrace, targetSlideIndex: number) => {
      if (!onAgentSlideFocus) {
        return;
      }

      focusEventSequenceRef.current += 1;
      onAgentSlideFocus({
        slideIndex: targetSlideIndex,
        eventId: `${Date.now()}-${focusEventSequenceRef.current}`,
        tool: trace.tool,
        status: trace.status,
        isMutatingTool: Boolean(trace.tool && MUTATING_TOOLS.has(trace.tool)),
      });
      activeFocusedSlideRef.current = targetSlideIndex;
      lastFocusDispatchAtRef.current = Date.now();
    },
    [onAgentSlideFocus]
  );

  const flushPendingSlideFocus = useCallback(() => {
    focusDispatchTimerRef.current = null;

    const pendingTrace = pendingFocusTraceRef.current;
    pendingFocusTraceRef.current = null;
    if (!pendingTrace) {
      return;
    }

    const targetSlideIndex = readTraceSlideIndex(pendingTrace);
    if (targetSlideIndex === null) {
      return;
    }

    emitAgentSlideFocus(pendingTrace, targetSlideIndex);
  }, [emitAgentSlideFocus]);

  const schedulePendingSlideFocus = useCallback(() => {
    if (focusDispatchTimerRef.current !== null) {
      return;
    }

    const elapsed = Date.now() - lastFocusDispatchAtRef.current;
    const waitMs = Math.max(MIN_SLIDE_FOCUS_DWELL_MS - elapsed, 0);
    focusDispatchTimerRef.current = window.setTimeout(
      flushPendingSlideFocus,
      waitMs
    );
  }, [flushPendingSlideFocus]);

  const maybeFollowAgentSlide = useCallback(
    (trace: ChatStreamTrace) => {
      if (!trace.tool || !SLIDE_FOCUS_TOOLS.has(trace.tool)) {
        return;
      }
      if (!trace.status || !SLIDE_FOCUS_STATUSES.has(trace.status)) {
        return;
      }

      const targetSlideIndex = readTraceSlideIndex(trace);
      if (targetSlideIndex === null) {
        return;
      }

      const traceSignature = `${trace.round ?? "?"}:${trace.tool}:${
        trace.status
      }:${targetSlideIndex}`;
      if (lastFollowedTraceRef.current === traceSignature) {
        return;
      }
      lastFollowedTraceRef.current = traceSignature;

      const activeFocusedSlide = activeFocusedSlideRef.current;
      const elapsed = Date.now() - lastFocusDispatchAtRef.current;
      const shouldDispatchImmediately =
        activeFocusedSlide === null ||
        activeFocusedSlide === targetSlideIndex ||
        elapsed >= MIN_SLIDE_FOCUS_DWELL_MS;

      if (shouldDispatchImmediately) {
        pendingFocusTraceRef.current = null;
        if (focusDispatchTimerRef.current !== null) {
          window.clearTimeout(focusDispatchTimerRef.current);
          focusDispatchTimerRef.current = null;
        }
        emitAgentSlideFocus(trace, targetSlideIndex);
        return;
      }

      pendingFocusTraceRef.current = trace;
      schedulePendingSlideFocus();
    },
    [emitAgentSlideFocus, schedulePendingSlideFocus]
  );

  useEffect(
    () => () => {
      if (focusDispatchTimerRef.current !== null) {
        window.clearTimeout(focusDispatchTimerRef.current);
      }
    },
    []
  );

  return {
    maybeFollowAgentSlide,
    resetFollowState,
  };
};

