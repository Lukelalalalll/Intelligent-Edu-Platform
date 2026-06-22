import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OutlineContent from "./OutlineContent";

const defaultProps = {
  isLoading: false,
  isStreaming: true,
  activeSlideIndex: null,
  highestActiveIndex: -1,
  statusMessage: "Generating outline",
  onDragEnd: vi.fn(),
  onAddSlide: vi.fn(),
  onUpdateSlide: vi.fn(),
  onDeleteSlide: vi.fn(),
};

function createMatchMedia() {
  return {
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

describe("OutlineContent auto-scroll", () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockReset();
    window.matchMedia = vi.fn().mockImplementation(createMatchMedia) as typeof window.matchMedia;
    window.requestAnimationFrame = vi.fn().mockImplementation((callback: (time: number) => void) => {
      callback(0);
      return 1;
    });
    window.cancelAnimationFrame = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
  });

  it("does not auto-scroll when the outline list still fits in the viewport", async () => {
    const outlines = [
      { content: "Slide one" },
      { content: "Slide two" },
    ];

    const { rerender } = render(
      <OutlineContent {...defaultProps} outlines={outlines} />
    );

    const viewport = screen.getByTestId("outline-list-viewport");
    const activeItem = viewport.querySelector(
      '[data-outline-item-index="0"]'
    ) as HTMLElement;

    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 260,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 0,
      writable: true,
    });
    Object.defineProperty(activeItem, "offsetTop", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(activeItem, "offsetHeight", {
      configurable: true,
      value: 140,
    });

    rerender(
      <OutlineContent
        {...defaultProps}
        outlines={outlines}
        activeSlideIndex={0}
      />
    );

    await waitFor(() => {
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  it("auto-scrolls when the active slide extends below the visible bottom edge", async () => {
    const outlines = [
      { content: "Slide one" },
      { content: "Slide two" },
      { content: "Slide three" },
    ];

    const { rerender } = render(
      <OutlineContent {...defaultProps} outlines={outlines} />
    );

    const viewport = screen.getByTestId("outline-list-viewport");
    const activeItem = viewport.querySelector(
      '[data-outline-item-index="2"]'
    ) as HTMLElement;

    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 920,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 240,
      writable: true,
    });
    Object.defineProperty(activeItem, "offsetTop", {
      configurable: true,
      value: 520,
    });
    Object.defineProperty(activeItem, "offsetHeight", {
      configurable: true,
      value: 180,
    });

    rerender(
      <OutlineContent
        {...defaultProps}
        outlines={outlines}
        activeSlideIndex={2}
      />
    );

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({
        top: 428,
        behavior: "smooth",
      });
    });
  });
});
