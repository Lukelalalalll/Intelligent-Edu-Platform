import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import UploadPage from "./UploadPage";

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}));

vi.mock("@/ppt_generator/shims/next-navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

vi.mock("./useUploadPageController", () => ({
  useUploadPageController: () => ({
    config: {
      prompt: "",
    },
    files: [],
    llmConfig: {},
    loadingState: {
      isLoading: false,
      message: "",
      showProgress: false,
      duration: 0,
      extra_info: "",
    },
    viewState: {
      actionSummary: null,
      generationDisabledReason: null,
      providerCards: [],
      primaryActionLabel: "",
      selectedProvider: null,
      statusCards: [],
    },
    actions: {
      handleFilesChange: vi.fn(),
      handleConfigChange: vi.fn(),
      handleGeneratePresentation: vi.fn(),
      handleProviderSelect: vi.fn(),
    },
  }),
}));

vi.mock("./UploadPageSections", () => ({
  UploadInputSection: () => <div>Upload Input Section</div>,
  UploadSetupSection: () => <div>Upload Setup Section</div>,
}));

describe("UploadPage back navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("goes back to dashboard from the workflow back button", () => {
    render(<UploadPage />);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });
});
