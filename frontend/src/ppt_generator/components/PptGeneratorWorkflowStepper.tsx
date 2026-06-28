import React from "react";

import { cn } from "@/lib/utils";
import shellStyles from "@/features/slides/components/PptGeneratorShell.module.css";

import styles from "./PptGeneratorWorkflowStepper.module.css";

const STEP_ORDER = ["prepare", "outline", "templates", "preview"] as const;

type WorkflowStepKey = (typeof STEP_ORDER)[number];

type WorkflowCopy = {
  workflow: string;
  steps: Record<WorkflowStepKey, string>;
};

const WORKFLOW_COPY: WorkflowCopy = {
  workflow: "PPT Generator Workflow",
  steps: {
    prepare: "Prompt & Files",
    outline: "Outline",
    templates: "Select Template",
    preview: "Generate PPT Preview",
  },
};

export interface PptGeneratorWorkflowStepperProps {
  activeStep: WorkflowStepKey;
  className?: string;
  onStepSelect?: (step: WorkflowStepKey) => void;
  clickableSteps?: WorkflowStepKey[];
}

export default function PptGeneratorWorkflowStepper({
  activeStep,
  className,
  onStepSelect,
  clickableSteps = [],
}: PptGeneratorWorkflowStepperProps) {
  const activeIndex = STEP_ORDER.indexOf(activeStep);

  return (
    <div
      className={cn(
        shellStyles.topRail,
        shellStyles.topRailUnified,
        styles.root,
        className
      )}
    >
      <div
        className={cn(
          shellStyles.stepperWrap,
          shellStyles.stepperWrapUnified,
          styles.workflowRail
        )}
      >
        <div className={cn(shellStyles.topRailUnifiedLeading, styles.leading)}>
          <div className={styles.workflowPill}>
            <i className="fas fa-file-powerpoint" aria-hidden="true" />
            <span>{WORKFLOW_COPY.workflow}</span>
          </div>
        </div>

        <div
          className={shellStyles.stepperGroup}
          aria-label={WORKFLOW_COPY.workflow}
        >
          {STEP_ORDER.map((stepKey, index) => {
            const isDone = index < activeIndex;
            const isActive = index === activeIndex;
            const isClickable =
              Boolean(onStepSelect) && clickableSteps.includes(stepKey);

            const stepNode = (
              <>
                <div className={shellStyles.stepperCircle}>
                  {isDone ? (
                    <i className="fas fa-check" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span className={shellStyles.stepperLabel}>
                  {WORKFLOW_COPY.steps[stepKey]}
                </span>
              </>
            );

            if (isClickable) {
              return (
                <button
                  key={stepKey}
                  type="button"
                  className={cn(
                    shellStyles.stepperButton,
                    shellStyles.stepperItem,
                    styles.stepperButton,
                    isDone && shellStyles.stepperItemDone,
                    isActive && shellStyles.stepperItemActive,
                    !isDone && !isActive && shellStyles.stepperItemFuture
                  )}
                  onClick={() => onStepSelect?.(stepKey)}
                  aria-current={isActive ? "step" : undefined}
                >
                  {stepNode}
                </button>
              );
            }

            return (
              <div
                key={stepKey}
                className={cn(
                  shellStyles.stepperItem,
                  isDone && shellStyles.stepperItemDone,
                  isActive && shellStyles.stepperItemActive,
                  !isDone && !isActive && shellStyles.stepperItemFuture
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {stepNode}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

