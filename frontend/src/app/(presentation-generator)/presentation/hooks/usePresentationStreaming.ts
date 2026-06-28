import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { getApiUrl } from "@/utils/api";
import { store, type AppDispatch } from "@/store/store";
import { pptGeneratorFetch } from "../../services/api/ppt_generator-fetch";
import {
  DEFAULT_STREAM_LOADING_STATE,
  type FetchUserSlides,
  type StreamLoadingState,
} from "./presentationStreaming/shared";
import { startPresentationStreamingSession } from "./presentationStreaming/session";

export const usePresentationStreaming = (
  presentationId: string,
  stream: string | null,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
  fetchUserSlides: FetchUserSlides
) => {
  const dispatch = useDispatch<AppDispatch>();
  const streamRunRef = useRef(0);
  const [loadingState, setLoadingState] = useState<StreamLoadingState>(
    DEFAULT_STREAM_LOADING_STATE
  );

  useEffect(() => {
    if (!stream) {
      setLoadingState(DEFAULT_STREAM_LOADING_STATE);
      void fetchUserSlides();
      return;
    }

    const runId = ++streamRunRef.current;

    return startPresentationStreamingSession({
      presentationId,
      runId,
      streamRunRef,
      dispatch,
      setLoading,
      setError,
      setLoadingState,
      fetchUserSlides,
      getCurrentPresentationData: () =>
        store.getState().presentationGeneration.presentationData,
      requestStream: (signal) =>
        pptGeneratorFetch(getApiUrl(`/api/v1/ppt/presentation/stream/${presentationId}`), {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
          },
          cache: "no-store",
          signal,
        }),
    });
  }, [presentationId, stream, dispatch, setLoading, setError, fetchUserSlides]);

  return { loadingState };
};

