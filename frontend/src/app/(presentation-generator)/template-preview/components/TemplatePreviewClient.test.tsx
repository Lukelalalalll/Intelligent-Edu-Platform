import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTemplatePreviewState = vi.hoisted(() => ({
  customTemplate: null as any,
  customLoading: false,
  customError: null as string | null,
  customFonts: [] as string[],
  deleteCustomTemplate: vi.fn(async () => ({ success: true })),
  imageObserverDisconnect: vi.fn(),
}));

const builtInTemplateCatalog = vi.hoisted(() => {
  const agendaLayout = {
    component: () => null,
    sampleData: {},
    layoutId: "agenda-layout",
    layoutName: "Agenda Layout",
    layoutDescription: "Sets up the opening agenda and deck rhythm.",
  };

  const dataLayout = {
    component: () => null,
    sampleData: {},
    layoutId: "data-layout",
    layoutName: "Data Layout",
    layoutDescription: "Handles charts, insights, and supporting detail.",
  };

  return {
    group: {
      id: "general",
      name: "General Template",
      description: "Balanced built-in layouts for broad PPT Generator decks.",
      layouts: [agendaLayout, dataLayout],
    },
  };
});

vi.mock("@/app/hooks/useCustomTemplates", () => ({
  useCustomTemplateDetails: () => ({
    template: mockTemplatePreviewState.customTemplate,
    loading: mockTemplatePreviewState.customLoading,
    error: mockTemplatePreviewState.customError,
    fonts: mockTemplatePreviewState.customFonts,
  }),
}));

vi.mock("@/app/presentation-templates", () => ({
  templates: [builtInTemplateCatalog.group],
  getTemplatesByTemplateName: (slug: string) =>
    slug === builtInTemplateCatalog.group.id ? builtInTemplateCatalog.group.layouts : [],
}));

vi.mock("@/utils/image-url-converter", () => ({
  setupImageUrlConverter: () => ({
    disconnect: mockTemplatePreviewState.imageObserverDisconnect,
  }),
}));

vi.mock("@/utils/mixpanel", () => ({
  MixpanelEvent: {
    TemplatePreview_Delete_Templates_Button_Clicked:
      "TemplatePreview_Delete_Templates_Button_Clicked",
    TemplatePreview_Delete_Templates_API_Call:
      "TemplatePreview_Delete_Templates_API_Call",
  },
  trackEvent: vi.fn(),
}));

vi.mock("@/components/ui/sonner", () => ({
  notify: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app/(presentation-generator)/services/api/template", () => ({
  default: {
    deleteCustomTemplate: mockTemplatePreviewState.deleteCustomTemplate,
  },
}));

vi.mock("@/shared/components/WelcomeBanner", () => ({
  default: ({
    title,
    subtitle,
    className,
  }: {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    className?: string;
  }) => (
    <section className={className}>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </section>
  ),
}));

import TemplatePreviewClient from "./TemplatePreviewClient";

function renderPreview(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <TemplatePreviewClient />
    </MemoryRouter>
  );
}

describe("TemplatePreviewClient", () => {
  beforeEach(() => {
    mockTemplatePreviewState.customTemplate = null;
    mockTemplatePreviewState.customLoading = false;
    mockTemplatePreviewState.customError = null;
    mockTemplatePreviewState.customFonts = [];
    mockTemplatePreviewState.deleteCustomTemplate.mockClear();
    mockTemplatePreviewState.imageObserverDisconnect.mockClear();
    document.head
      .querySelectorAll('script[src*="tailwindcss.com"]')
      .forEach((node) => node.remove());
  });

  it("renders the compact built-in header and preview stack", () => {
    renderPreview("/slides/ppt_generator/template-preview?slug=general");

    expect(
      screen.getByRole("heading", { name: "Template Preview" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Templates" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Inspect the built-in family layout sequence.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Agenda Layout")).toBeInTheDocument();
    expect(screen.getByText("Data Layout")).toBeInTheDocument();
    expect(screen.queryByText("Built-in family")).not.toBeInTheDocument();
    expect(document.querySelector('script[src*="tailwindcss.com"]')).toBeNull();
  });

  it("renders the custom badge and delete action for custom template previews", () => {
    mockTemplatePreviewState.customTemplate = {
      id: "42",
      name: "Custom Strategy",
      description: "Saved custom layout system.",
      template: {
        name: "Custom Strategy",
        description: "Saved custom layout system.",
      },
      fonts: ["Inter", "IBM Plex Sans"],
      layouts: [
        {
          component: () => null,
          sampleData: {},
          layoutId: "custom-hero",
          rawLayoutId: "custom_hero",
          rawLayoutName: "Custom Hero",
          layoutDescription: "Branded opening layout for key message framing.",
        },
      ],
    };
    mockTemplatePreviewState.customFonts = ["Inter", "IBM Plex Sans"];

    renderPreview("/slides/ppt_generator/template-preview?slug=custom-42");

    expect(screen.getByText("Custom template")).toBeInTheDocument();
    expect(screen.getByText("Custom Strategy")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Template" })
    ).toBeInTheDocument();
  });

  it("renders the workspace empty state with back navigation for invalid slugs", () => {
    renderPreview("/slides/ppt_generator/template-preview?slug=missing");

    expect(
      screen.getByRole("heading", { name: "Template Preview" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Template preview unavailable").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "Back to Templates" })
    ).toBeInTheDocument();
  });
});

