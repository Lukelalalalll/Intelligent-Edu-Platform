import React from 'react';
import { Workflow } from 'lucide-react';

import { cn } from '@/lib/utils';
import shellStyles from '@/features/slides/components/PptGeneratorShell.module.css';

import {
  VIDEO_GEN_WORKFLOW_STEPS,
  type VideoGenWorkflowStep,
} from '../videoGenWorkflow';
import styles from './VideoGenWorkflowStepper.module.css';

interface VideoGenWorkflowStepperProps {
  activeStep: VideoGenWorkflowStep;
  availableSteps: VideoGenWorkflowStep[];
  onStepSelect?: (step: VideoGenWorkflowStep) => void;
  className?: string;
}

const STEP_COPY: Record<VideoGenWorkflowStep, string> = {
  input: 'Input',
  script: 'Script',
  scene: 'Scene',
  generate: 'Generate',
};

export default function VideoGenWorkflowStepper({
  activeStep,
  availableSteps,
  onStepSelect,
  className,
}: VideoGenWorkflowStepperProps) {
  const activeIndex = VIDEO_GEN_WORKFLOW_STEPS.indexOf(activeStep);

  return (
    <div
      data-testid="video-gen-workflow-stepper"
      className={cn(
        shellStyles.topRail,
        shellStyles.topRailUnified,
        styles.root,
        className,
      )}
    >
      <div
        className={cn(
          shellStyles.stepperWrap,
          shellStyles.stepperWrapUnified,
          styles.workflowRail,
        )}
      >
        <div className={cn(shellStyles.topRailUnifiedLeading, styles.leading)}>
          <div className={styles.workflowPill}>
            <Workflow className={styles.workflowIcon} aria-hidden="true" />
            <span>Video Workflow</span>
          </div>
        </div>

        <div
          className={cn(shellStyles.stepperGroup, styles.stepperGroupCustom)}
          aria-label="Video generation workflow"
        >
          {VIDEO_GEN_WORKFLOW_STEPS.map((stepKey, index) => {
            const isDone = index < activeIndex;
            const isActive = index === activeIndex;
            const isAvailable = availableSteps.includes(stepKey);
            const isClickable = Boolean(onStepSelect) && isDone && isAvailable;

            const stepNode = (
              <>
                <div className={cn(shellStyles.stepperCircle, styles.stepperCircle)}>
                  {isDone ? (
                    <i className="fas fa-check" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span className={shellStyles.stepperLabel}>{STEP_COPY[stepKey]}</span>
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
                    styles.stepperItem,
                    styles.stepperButton,
                    isDone && shellStyles.stepperItemDone,
                    isDone && styles.stepperItemDone,
                    isActive && shellStyles.stepperItemActive,
                    isActive && styles.stepperItemActive,
                    !isDone && !isActive && shellStyles.stepperItemFuture,
                    !isDone && !isActive && styles.stepperItemFuture,
                  )}
                  onClick={() => onStepSelect?.(stepKey)}
                  aria-current={isActive ? 'step' : undefined}
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
                  styles.stepperItem,
                  isDone && shellStyles.stepperItemDone,
                  isDone && styles.stepperItemDone,
                  isActive && shellStyles.stepperItemActive,
                  isActive && styles.stepperItemActive,
                  !isDone && !isActive && shellStyles.stepperItemFuture,
                  !isDone && !isActive && styles.stepperItemFuture,
                )}
                aria-current={isActive ? 'step' : undefined}
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
