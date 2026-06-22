import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOutlineStreaming } from "./useOutlineStreaming";

const mockDispatch = vi.fn();
const mockEnsurePresentonSession = vi.fn();
const mockNotifyError = vi.fn();
const storeState = {
  presentationGeneration: {
    outlines: [] as { content: string }[],
  },
};

vi.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock("@/store/slices/presentationGeneration", () => ({
  setOutlines: (payload: unknown) => ({
    type: "setOutlines",
    payload,
  }),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: {
    error: (...args: unknown[]) => mockNotifyError(...args),
  },
}));

vi.mock("@/utils/api", () => ({
  getApiUrl: (path: string) => path,
}));

vi.mock("../../services/api/presenton-fetch", () => ({
  ensurePresentonSession: (...args: unknown[]) =>
    mockEnsurePresentonSession(...args),
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emit(type: string, data: unknown) {
    const listeners = this.listeners.get(type) ?? [];
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of listeners) {
      listener(event);
    }
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

describe("useOutlineStreaming", () => {
  const rafQueue: FrameRequestCallback[] = [];

  const flushAnimationFrame = () => {
    const callbacks = rafQueue.splice(0, rafQueue.length);
    callbacks.forEach((callback, index) => callback(index * 16));
  };

  beforeEach(() => {
    mockDispatch.mockReset();
    mockEnsurePresentonSession.mockReset();
    mockEnsurePresentonSession.mockResolvedValue(undefined);
    mockNotifyError.mockReset();
    storeState.presentationGeneration.outlines = [];
    MockEventSource.reset();
    rafQueue.length = 0;

    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      rafQueue.push(callback);
      return rafQueue.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const index = id - 1;
      if (index >= 0 && index < rafQueue.length) {
        rafQueue[index] = () => undefined;
      }
    });
  });

  it("buffers chunk updates per animation frame and dispatches to Redux only on complete", async () => {
    const { result } = renderHook(() => useOutlineStreaming("presentation-1"));

    await waitFor(() => {
      expect(mockEnsurePresentonSession).toHaveBeenCalledTimes(1);
      expect(MockEventSource.instances).toHaveLength(1);
    });

    const stream = MockEventSource.instances[0];

    act(() => {
      stream.emit("response", {
        type: "chunk",
        chunk: '{"slides":[{"content":"Slide 1"}',
      });
      stream.emit("response", {
        type: "chunk",
        chunk: ',{"content":"Slide 2"}]',
      });
    });

    expect(result.current.displayOutlines).toEqual([]);
    expect(mockDispatch).not.toHaveBeenCalled();

    act(() => {
      flushAnimationFrame();
    });

    await waitFor(() => {
      expect(result.current.displayOutlines).toEqual([
        { content: "Slide 1" },
        { content: "Slide 2" },
      ]);
      expect(result.current.activeSlideIndex).toBe(1);
      expect(result.current.highestActiveIndex).toBe(1);
    });
    expect(mockDispatch).not.toHaveBeenCalled();

    act(() => {
      stream.emit("response", {
        type: "complete",
        presentation: {
          outlines: {
            slides: [
              { content: "Slide 1" },
              { content: "Slide 2" },
            ],
          },
        },
      });
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "setOutlines",
        payload: [
          { content: "Slide 1" },
          { content: "Slide 2" },
        ],
      });
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.statusMessage).toBe("Outline ready");
    });
  });
});
