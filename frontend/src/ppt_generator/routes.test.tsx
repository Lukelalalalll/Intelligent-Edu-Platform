import React, { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/ppt_generator/bootstrap", () => ({
  PptGeneratorBootstrap: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: React.PropsWithChildren<{ asChild?: boolean }>) => {
    if (asChild) {
      return <>{children}</>;
    }
    return <button {...props}>{children}</button>;
  },
}));

vi.mock(
  "@/app/(presentation-generator)/(workspace)/dashboard/components/DashboardPage",
  () => ({
    default: () => <div data-testid="mock-dashboard-page" />,
  })
);

vi.mock(
  "@/app/(presentation-generator)/presentation/components/PresentationPage",
  () => ({
    default: ({ presentation_id }: { presentation_id: string }) => (
      <div data-testid="mock-presentation-page">{presentation_id}</div>
    ),
  })
);

import {
  PptGeneratorPresentationRoute,
  PptGeneratorScreen,
} from "./routes";

describe("PptGeneratorScreen", () => {
  it("supports full-width, no-inset layout overrides", () => {
    const { container } = render(
      <PptGeneratorScreen contentWidth="full" contentInset="none">
        <div>Content</div>
      </PptGeneratorScreen>
    );

    const section = container.querySelector("section");
    const contentWrapper = section?.firstElementChild;

    expect(section).toBeTruthy();
    expect(section?.className).not.toContain("px-3");
    expect(section?.className).not.toContain("pb-6");
    expect(section?.className).not.toContain("pt-4");
    expect(contentWrapper?.className).toContain("w-full");
    expect(contentWrapper?.className).toContain("max-w-none");
  });
});

describe("PptGeneratorPresentationRoute", () => {
  it("renders the presentation page inside the full-width, no-inset shell", async () => {
    const { container } = render(
      <MemoryRouter
        initialEntries={["/slides/ppt_generator/presentation?id=test-presentation"]}
      >
        <Suspense fallback={<div data-testid="route-fallback" />}>
          <PptGeneratorPresentationRoute />
        </Suspense>
      </MemoryRouter>
    );

    expect(
      await screen.findByTestId("mock-presentation-page")
    ).toHaveTextContent("test-presentation");

    const section = container.querySelector("section");
    const contentWrapper = section?.firstElementChild;

    expect(section?.className).not.toContain("px-3");
    expect(section?.className).not.toContain("pb-6");
    expect(section?.className).not.toContain("pt-4");
    expect(contentWrapper?.className).toContain("w-full");
    expect(contentWrapper?.className).toContain("max-w-none");
  });
});

