import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PptGeneratorWorkflowStepper from "./PptGeneratorWorkflowStepper";

const TRANSLATION_MAP: Record<string, string> = {
  "ppt_generator.workflow.label": "PPT Generator Workflow",
  "ppt_generator.workflow.back": "Back",
  "ppt_generator.workflow.backAriaLabel": "Go back to previous step",
  "ppt_generator.workflow.step.prepare": "Prompt & Files",
  "ppt_generator.workflow.step.outline": "Outline",
  "ppt_generator.workflow.step.templates": "Select Template",
  "ppt_generator.workflow.step.preview": "Generate PPT Preview",
};

vi.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => TRANSLATION_MAP[key] ?? key,
  }),
}));

describe("PptGeneratorWorkflowStepper", () => {
  it("renders Back to the left of the workflow pill and calls onBack", () => {
    const onBack = vi.fn();

    render(
      <PptGeneratorWorkflowStepper activeStep="outline" onBack={onBack} />
    );

    const backButton = screen.getByRole("button", { name: /back/i });
    const workflowPill = screen
      .getByText("PPT Generator Workflow")
      .closest("div");

    expect(workflowPill).not.toBeNull();
    expect(backButton.parentElement).toBe(workflowPill?.parentElement);
    expect(backButton.nextElementSibling).toBe(workflowPill);

    fireEvent.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not render Back when onBack is omitted", () => {
    render(<PptGeneratorWorkflowStepper activeStep="prepare" />);

    expect(
      screen.queryByRole("button", { name: /^back$/i })
    ).not.toBeInTheDocument();
  });

  it("marks the active step and lets clickable steps navigate", () => {
    const onStepSelect = vi.fn();

    render(
      <PptGeneratorWorkflowStepper
        activeStep="templates"
        clickableSteps={["outline", "templates"]}
        onStepSelect={onStepSelect}
      />
    );

    const activeStep = screen.getByRole("button", { name: /select template/i });
    const outlineStep = screen.getByRole("button", { name: /^outline$/i });

    expect(activeStep).toHaveAttribute("aria-current", "step");

    fireEvent.click(outlineStep);

    expect(onStepSelect).toHaveBeenCalledWith("outline");
  });
});
