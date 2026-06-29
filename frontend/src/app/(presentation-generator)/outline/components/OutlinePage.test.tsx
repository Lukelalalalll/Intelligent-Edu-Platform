import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import presentationGenerationReducer from "@/store/slices/presentationGeneration";
import pptGenUploadReducer from "@/store/slices/presentationGenUpload";
import userConfigReducer from "@/store/slices/userConfig";
import undoRedoReducer from "@/store/slices/undoRedoSlice";

import OutlinePage from "./OutlinePage";

const TRANSLATION_MAP: Record<string, string> = {
  "ppt_generator.workflow.label": "PPT Generator Workflow",
  "ppt_generator.workflow.back": "Back",
  "ppt_generator.workflow.backAriaLabel": "Go back to previous step",
  "ppt_generator.workflow.step.prepare": "Prompt & Files",
  "ppt_generator.workflow.step.outline": "Outline",
  "ppt_generator.workflow.step.templates": "Select Template",
  "ppt_generator.workflow.step.preview": "Generate PPT Preview",
  "ppt_generator.outline.summary.template.none": "Not selected",
  "ppt_generator.outline.summary.template.custom": "Custom template selected",
};

const { mockPush, mockHandleSubmit } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockHandleSubmit: vi.fn(),
}));

vi.mock("@/ppt_generator/shims/next-navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => TRANSLATION_MAP[key] ?? key,
  }),
}));

vi.mock("@/components/ui/overlay-loader", () => ({
  OverlayLoader: () => null,
}));

vi.mock("@/shared/components/WelcomeBanner", () => ({
  default: () => <div>Welcome Banner</div>,
}));

vi.mock("./OutlineContent", () => ({
  default: () => <div>Outline Content</div>,
}));

vi.mock("./EmptyStateView", () => ({
  default: () => <div>Empty State</div>,
}));

vi.mock("./TemplateSelection", () => ({
  default: () => <div>Template Selection</div>,
}));

vi.mock("./GenerateButton", () => ({
  default: () => <button type="button">Generate</button>,
}));

vi.mock("../hooks/useOutlineStreaming", () => ({
  useOutlineStreaming: () => ({
    displayOutlines: [{ content: "Slide 1" }],
    isLoading: false,
    isStreaming: false,
    activeSlideIndex: null,
    highestActiveIndex: -1,
    statusMessage: "Ready",
  }),
}));

vi.mock("../hooks/useOutlineManagement", () => ({
  useOutlineManagement: () => ({
    handleDragEnd: vi.fn(),
    handleAddSlide: vi.fn(),
    handleUpdateSlide: vi.fn(),
    handleDeleteSlide: vi.fn(),
  }),
}));

vi.mock("../hooks/usePresentationGeneration", () => ({
  usePresentationGeneration: () => ({
    loadingState: {
      message: "",
      isLoading: false,
      showProgress: false,
      duration: 0,
    },
    handleSubmit: mockHandleSubmit,
  }),
}));

function renderOutlinePage(files: unknown[] = []) {
  const store = configureStore({
    reducer: {
      presentationGeneration: presentationGenerationReducer,
      pptGenUpload: pptGenUploadReducer,
      userConfig: userConfigReducer,
      undoRedo: undoRedoReducer,
    },
    preloadedState: {
      presentationGeneration: {
        presentation_id: "presentation-1",
      },
      pptGenUpload: {
        config: null,
        files,
      },
    },
  });

  return render(
    <Provider store={store}>
      <OutlinePage />
    </Provider>
  );
}

describe("OutlinePage back navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockHandleSubmit.mockReset();
  });

  it("returns from templates back to outline without navigating", () => {
    renderOutlinePage();

    fireEvent.click(screen.getByRole("button", { name: /select template/i }));
    expect(screen.getByText("Template Selection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(screen.getByText("Outline Content")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps the workflow shell stable when switching into template selection", () => {
    renderOutlinePage();

    expect(screen.getByTestId("ppt-generator-workflow-stepper")).toBeInTheDocument();
    expect(screen.getByTestId("outline-stage-shell")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select template/i }));

    expect(screen.getByTestId("ppt-generator-workflow-stepper")).toBeInTheDocument();
    expect(screen.getByTestId("outline-template-stage")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /select template/i })
    ).toHaveAttribute("aria-current", "step");
  });

  it("goes back to documents preview when uploaded files exist", () => {
    renderOutlinePage([{ name: "outline.pdf", file_path: "/tmp/outline.pdf" }]);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith("/documents-preview");
  });

  it("goes back to upload when there are no uploaded files", () => {
    renderOutlinePage();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith("/upload");
  });
});
