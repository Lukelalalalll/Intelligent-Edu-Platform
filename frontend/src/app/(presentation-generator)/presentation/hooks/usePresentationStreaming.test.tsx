import React, { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePresentationStreaming } from "./usePresentationStreaming";

const encoder = new TextEncoder();
const mockDispatch = vi.fn();
const mockPptGeneratorFetch = vi.fn();
const mockTrackEvent = vi.fn();
const mockNotifyError = vi.fn();
const mockNotifyWarning = vi.fn();
const mockStoreState = {
  presentationGeneration: {
    presentationData: null,
  },
};

vi.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
}));

vi.mock("@/store/slices/presentationGeneration", () => ({
  clearPresentationData: () => ({ type: "clearPresentationData" }),
  setPresentationData: (payload: unknown) => ({
    type: "setPresentationData",
    payload,
  }),
  setStreaming: (payload: unknown) => ({
    type: "setStreaming",
    payload,
  }),
  updateSlide: (payload: unknown) => ({
    type: "updateSlide",
    payload,
  }),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: {
    error: (...args: unknown[]) => mockNotifyError(...args),
    warning: (...args: unknown[]) => mockNotifyWarning(...args),
  },
}));

vi.mock("@/utils/mixpanel", () => ({
  MixpanelEvent: {
    Presentation_Stream_API_Call: "Presentation_Stream_API_Call",
    Presentation_Stream_Recovered_From_Persisted_Data:
      "Presentation_Stream_Recovered_From_Persisted_Data",
  },
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("@/utils/api", () => ({
  getApiUrl: (path: string) => path,
  normalizeBackendAssetUrls: <T,>(value: T) => value,
}));

vi.mock("../../services/api/ppt_generator-fetch", () => ({
  pptGeneratorFetch: (...args: unknown[]) => mockPptGeneratorFetch(...args),
}));

vi.mock("@/store/store", () => ({
  store: {
    getState: () => mockStoreState,
  },
}));

const buildStatusFrame = (status: string) =>
  encoder.encode(
    `event: response\ndata: {"type":"status","status":"${status}"}\n\n`
  );

describe("usePresentationStreaming", () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockPptGeneratorFetch.mockReset();
    mockTrackEvent.mockReset();
    mockNotifyError.mockReset();
    mockNotifyWarning.mockReset();
    window.history.replaceState({}, "", "/presentation?stream=1");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the first-content timeout when a status event arrives", async () => {
    vi.useFakeTimers();
    const setLoading = vi.fn();
    const setError = vi.fn();
    const fetchUserSlides = vi.fn().mockResolvedValue(null);

    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(buildStatusFrame("starting"));
        },
      }),
      { status: 200 }
    );

    mockPptGeneratorFetch.mockResolvedValue(response);

    const { result, unmount } = renderHook(() =>
      usePresentationStreaming(
        "presentation-1",
        "1",
        setLoading,
        setError,
        fetchUserSlides
      )
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loadingState.statusText).toBe("Still generating");

    act(() => {
      vi.advanceTimersByTime(19_000);
    });

    expect(result.current.loadingState.detailText).toBe(
      "The presentation is still being generated. Waiting for the first slide content to arrive."
    );

    unmount();
  });

  it("cancels the stale reader under StrictMode and keeps only the current stream active", async () => {
    const setLoading = vi.fn();
    const setError = vi.fn();
    const fetchUserSlides = vi.fn().mockResolvedValue(null);
    const firstCancel = vi.fn().mockResolvedValue(undefined);
    const secondCancel = vi.fn().mockResolvedValue(undefined);

    const firstReader = {
      read: vi.fn(() => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {})),
      cancel: firstCancel,
    };
    const secondReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          value: buildStatusFrame("starting"),
          done: false,
        })
        .mockImplementation(
          () => new Promise<ReadableStreamReadResult<Uint8Array>>(() => {})
        ),
      cancel: secondCancel,
    };

    mockPptGeneratorFetch
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => firstReader },
      })
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => secondReader },
      });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );

    const { result, unmount } = renderHook(
      () =>
        usePresentationStreaming(
          "presentation-2",
          "1",
          setLoading,
          setError,
          fetchUserSlides
        ),
      { wrapper }
    );

    await waitFor(() => {
      expect(mockPptGeneratorFetch).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.loadingState.statusText).toBe("Still generating");
    });

    unmount();
    expect(secondCancel).toHaveBeenCalled();
  });

  it("does not throw when cleanup closes the stream while a read is in flight", async () => {
    const setLoading = vi.fn();
    const setError = vi.fn();
    const fetchUserSlides = vi.fn().mockResolvedValue(null);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    let resolveSecondRead:
      | ((value: ReadableStreamReadResult<Uint8Array>) => void)
      | null = null;

    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          value: buildStatusFrame("starting"),
          done: false,
        })
        .mockImplementationOnce(
          () =>
            new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
              resolveSecondRead = resolve;
            })
        )
        .mockResolvedValue({
          value: new Uint8Array(),
          done: true,
        }),
      cancel: vi.fn(() => {
        resolveSecondRead?.({
          value: new Uint8Array(),
          done: false,
        });
        return Promise.resolve();
      }),
    };

    mockPptGeneratorFetch.mockResolvedValue({
      ok: true,
      body: { getReader: () => reader },
    });

    const { unmount } = renderHook(() =>
      usePresentationStreaming(
        "presentation-3",
        "1",
        setLoading,
        setError,
        fetchUserSlides
      )
    );

    await waitFor(() => {
      expect(reader.read).toHaveBeenCalled();
    });

    unmount();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(
      consoleErrorSpy.mock.calls.some((call) =>
        String(call[0]).includes("Cannot read properties of null")
      )
    ).toBe(false);
  });
});


