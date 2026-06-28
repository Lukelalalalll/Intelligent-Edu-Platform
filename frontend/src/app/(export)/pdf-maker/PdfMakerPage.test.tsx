import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PdfMakerPage from "./PdfMakerPage";
import {
  getPptxTitleMode,
  resolveRenderedLineHeightPx,
} from "./pptxTitleMode";

const mockDispatch = vi.fn();
const mockGetPresentation = vi.fn();
const mockNotifyError = vi.fn();
const mockNotifyWarning = vi.fn();
const mockTrackEvent = vi.fn();
const mockApplyPresentationThemeToElement = vi.fn(
  (_element?: HTMLElement | null, _theme?: unknown) => {
    void _element;
    void _theme;
    return {
      loaded: [],
      skipped: [],
    };
  }
);
const mockUseFontLoader = vi.fn((_fonts?: Record<string, string>) => {
  void _fonts;
  return {
    loaded: [],
    skipped: [],
  };
});
let mockPresentationData = {
  slides: [
    {
      id: "slide-1",
      index: 0,
      layout: "custom-demo-layout",
      layout_group: "Report",
      speaker_note: "",
      type: "content",
      title: "Tang & Song",
    },
  ],
  theme: null,
};

vi.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: any) => unknown) =>
    selector({
      presentationGeneration: {
        presentationData: mockPresentationData,
      },
    }),
}));

vi.mock("@/ppt_generator/shims/next-navigation", () => ({
  usePathname: () => "/export/pdf-maker",
}));

vi.mock("@/app/(presentation-generator)/services/api/dashboard", () => ({
  DashboardApi: {
    getPresentation: (...args: unknown[]) => mockGetPresentation(...args),
  },
}));

vi.mock("@/app/(presentation-generator)/services/api/api-error-handler", () => ({
  ApiResponseHandler: {
    handleResponse: vi.fn(),
  },
}));

vi.mock("@/app/(presentation-generator)/hooks/useFontLoad", () => ({
  useFontLoader: (fonts: Record<string, string>) => mockUseFontLoader(fonts),
}));

vi.mock(
  "@/app/(presentation-generator)/presentation/utils/applyPresentationThemeDom",
  () => ({
    applyPresentationThemeToElement: (element: HTMLElement | null, theme: unknown) =>
      mockApplyPresentationThemeToElement(element, theme),
  })
);

vi.mock("@/app/(presentation-generator)/components/PresentationRender", () => ({
  default: ({
    slide,
  }: {
    slide: { id: string; layout_group?: string; title?: string };
  }) => (
    <div data-testid={`slide-scale-${slide.id}`}>
      <h1>{slide.title ?? "Tang & Song"}</h1>
      <p>body</p>
    </div>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: {
    error: (...args: unknown[]) => mockNotifyError(...args),
    warning: (...args: unknown[]) => mockNotifyWarning(...args),
  },
}));

vi.mock("@/utils/mixpanel", () => ({
  MixpanelEvent: {
    PdfMaker_Retry_Button_Clicked: "PdfMaker_Retry_Button_Clicked",
  },
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

vi.mock("@/store/slices/presentationGeneration", () => ({
  setPresentationData: (payload: unknown) => ({
    type: "presentationGeneration/setPresentationData",
    payload,
  }),
}));

describe("PdfMakerPage", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/pdf-maker");
    mockDispatch.mockReset();
    mockGetPresentation.mockReset();
    mockNotifyError.mockReset();
    mockNotifyWarning.mockReset();
    mockTrackEvent.mockReset();
    mockApplyPresentationThemeToElement.mockClear();
    mockUseFontLoader.mockClear();
    mockPresentationData = {
      slides: [
        {
          id: "slide-1",
          index: 0,
          layout: "custom-demo-layout",
          layout_group: "Report",
          speaker_note: "",
          type: "content",
          title: "Tang & Song",
        },
      ],
      theme: null,
    };

    mockGetPresentation.mockResolvedValue({
      ...mockPresentationData,
      fonts: {},
    });

    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const element = this as HTMLElement;
        if (element.classList.contains("slide-export-inner")) {
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 1280,
            bottom: 720,
            width: 1280,
            height: 720,
            toJSON: () => ({}),
          };
        }
        if (element.tagName === "H1") {
          return {
            x: 48,
            y: 42,
            left: 48,
            top: 42,
            right: 640,
            bottom: 108,
            width: 592,
            height: 66,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 400,
          bottom: 200,
          width: 400,
          height: 200,
          toJSON: () => ({}),
        };
      },
    });

    vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element) => {
      const tagName = (element as HTMLElement).tagName;
      return {
        fontSize: tagName === "H1" ? "58px" : "18px",
        fontWeight: tagName === "H1" ? "700" : "400",
      } as CSSStyleDeclaration;
    });
  });

  it("does not inject the Tailwind CDN script while rendering export slides", async () => {
    render(<PdfMakerPage presentation_id="presentation-1" />);

    await waitFor(() => {
      expect(mockGetPresentation).toHaveBeenCalledWith("presentation-1");
    });

    expect(document.querySelector('script[src*="tailwindcss.com"]')).toBeNull();
  });

  it("marks top title headings for screenshot only during pptx export", async () => {
    window.history.replaceState({}, "", "/pdf-maker?exportAs=pptx");

    render(<PdfMakerPage presentation_id="presentation-1" />);

    await waitFor(() => {
      expect(mockGetPresentation).toHaveBeenCalledWith("presentation-1");
    });

    await waitFor(() => {
      const title = document.querySelector("h1");
      expect(title?.getAttribute("data-pptx-title-mode")).toBe("single-line-safe");
      expect(title?.getAttribute("data-pptx-title-line-count")).toBe("1");
      expect(title?.getAttribute("data-screenshot")).toBe("true");
      expect(title?.getAttribute("data-screenshot-include-children")).toBe(
        "true"
      );
    });
  });

  it("preserves preview layout for multi-line pptx titles", async () => {
    window.history.replaceState({}, "", "/pdf-maker?exportAs=pptx");

    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect() {
        const element = this as HTMLElement;
        if (element.classList.contains("slide-export-inner")) {
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 1280,
            bottom: 720,
            width: 1280,
            height: 720,
            toJSON: () => ({}),
          };
        }
        if (element.tagName === "H1") {
          return {
            x: 48,
            y: 42,
            left: 48,
            top: 42,
            right: 640,
            bottom: 176,
            width: 592,
            height: 134,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 400,
          bottom: 200,
          width: 400,
          height: 200,
          toJSON: () => ({}),
        };
      },
    });

    render(<PdfMakerPage presentation_id="presentation-1" />);

    await waitFor(() => {
      expect(mockGetPresentation).toHaveBeenCalledWith("presentation-1");
    });

    await waitFor(() => {
      const title = document.querySelector("h1");
      expect(title?.getAttribute("data-pptx-title-mode")).toBe("preserve-preview");
      expect(title?.getAttribute("data-pptx-title-line-count")).toBe("2");
      expect(title?.hasAttribute("data-screenshot")).toBe(false);
      expect(title?.hasAttribute("data-screenshot-include-children")).toBe(false);
    });
  });

  it("does not mark title headings during pdf export", async () => {
    window.history.replaceState({}, "", "/pdf-maker?exportAs=pdf");

    render(<PdfMakerPage presentation_id="presentation-1" />);

    await waitFor(() => {
      expect(mockGetPresentation).toHaveBeenCalledWith("presentation-1");
    });

    const title = await waitFor(() => document.querySelector("h1"));
    expect(title?.hasAttribute("data-screenshot")).toBe(false);
    expect(title?.hasAttribute("data-screenshot-include-children")).toBe(false);
    expect(title?.hasAttribute("data-pptx-title-mode")).toBe(false);
    expect(title?.hasAttribute("data-pptx-title-line-count")).toBe(false);
  });
});

describe("pptxTitleMode helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back from line-height normal using font size", () => {
    expect(
      resolveRenderedLineHeightPx({
        fontSize: "40px",
        lineHeight: "normal",
      } as CSSStyleDeclaration)
    ).toBeCloseTo(48);
  });

  it("detects single-line titles", () => {
    const element = document.createElement("h1");
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontSize: "40px",
      lineHeight: "48px",
    } as CSSStyleDeclaration);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 48,
      width: 100,
      height: 48,
      toJSON: () => ({}),
    });

    expect(getPptxTitleMode(element)).toEqual({
      mode: "single-line-safe",
      lineCount: 1,
    });
  });

  it("detects multi-line titles", () => {
    const element = document.createElement("h1");
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      fontSize: "40px",
      lineHeight: "48px",
    } as CSSStyleDeclaration);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 96,
      width: 100,
      height: 96,
      toJSON: () => ({}),
    });

    expect(getPptxTitleMode(element)).toEqual({
      mode: "preserve-preview",
      lineCount: 2,
    });
  });
});
