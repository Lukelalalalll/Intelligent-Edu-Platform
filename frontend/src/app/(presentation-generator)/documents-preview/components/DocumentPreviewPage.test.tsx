import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import presentationGenerationReducer from "@/store/slices/presentationGeneration";
import pptGenUploadReducer from "@/store/slices/presentationGenUpload";
import userConfigReducer from "@/store/slices/userConfig";
import undoRedoReducer from "@/store/slices/undoRedoSlice";

import DocumentPreviewPage from "./DocumentPreviewPage";

const { mockPush, mockReplace } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("@/ppt_generator/shims/next-navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  usePathname: () => "/documents-preview",
}));

vi.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/overlay-loader", () => ({
  OverlayLoader: () => null,
}));

vi.mock("@/shared/components/WelcomeBanner", () => ({
  default: () => <div>Welcome Banner</div>,
}));

vi.mock("@/shared/page-entrance/usePageEntrance", () => ({
  usePageEntrance: () => false,
}));

vi.mock("./MarkdownRenderer", () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/utils/mixpanel", () => ({
  trackEvent: vi.fn(),
  MixpanelEvent: {},
}));

function renderDocumentPreviewPage() {
  const store = configureStore({
    reducer: {
      presentationGeneration: presentationGenerationReducer,
      pptGenUpload: pptGenUploadReducer,
      userConfig: userConfigReducer,
      undoRedo: undoRedoReducer,
    },
    preloadedState: {
      pptGenUpload: {
        config: null,
        files: [],
      },
    },
  });

  return render(
    <Provider store={store}>
      <DocumentPreviewPage />
    </Provider>
  );
}

describe("DocumentPreviewPage back navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  it("goes back to upload from the workflow back button", () => {
    renderDocumentPreviewPage();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith("/upload");
  });
});
