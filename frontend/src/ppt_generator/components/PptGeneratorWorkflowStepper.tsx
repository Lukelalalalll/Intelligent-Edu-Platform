import React from "react";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import shellStyles from "@/features/slides/components/PptGeneratorShell.module.css";
import { useI18n } from "@/shared/i18n";

import styles from "./PptGeneratorWorkflowStepper.module.css";

const STEP_ORDER = ["prepare", "outline", "templates", "preview"] as const;

type WorkflowStepKey = (typeof STEP_ORDER)[number];

export interface PptGeneratorWorkflowStepperProps {
  activeStep: WorkflowStepKey;
  className?: string;
  onStepSelect?: (step: WorkflowStepKey) => void;
  clickableSteps?: WorkflowStepKey[];
  onBack?: () => void;
}

export default function PptGeneratorWorkflowStepper({
  activeStep,
  className,
  onStepSelect,
  clickableSteps = [],
  onBack,
}: PptGeneratorWorkflowStepperProps) {
  const { t } = useI18n();
  const activeIndex = STEP_ORDER.indexOf(activeStep);
  const workflowCopy = React.useMemo(
    () => ({
      workflow: t("ppt_generator.workflow.label"),
      back: t("ppt_generator.workflow.back"),
      backAriaLabel: t("ppt_generator.workflow.backAriaLabel"),
      steps: {
        prepare: t("ppt_generator.workflow.step.prepare"),
        outline: t("ppt_generator.workflow.step.outline"),
        templates: t("ppt_generator.workflow.step.templates"),
        preview: t("ppt_generator.workflow.step.preview"),
      } satisfies Record<WorkflowStepKey, string>,
    }),
    [t]
  );

  return (
    <div
      data-testid="ppt-generator-workflow-stepper"
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
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={styles.backButton}
              aria-label={workflowCopy.backAriaLabel}
            >
              <ChevronLeft className={styles.backIcon} aria-hidden="true" />
              <span>{workflowCopy.back}</span>
            </button>
          )}
          <div className={styles.workflowPill}>
            <i className="fas fa-file-powerpoint" aria-hidden="true" />
            <span>{workflowCopy.workflow}</span>
          </div>
        </div>

        <div
          className={cn(shellStyles.stepperGroup, styles.stepperGroupCustom)}
          aria-label={workflowCopy.workflow}
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
                  {workflowCopy.steps[stepKey]}
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
