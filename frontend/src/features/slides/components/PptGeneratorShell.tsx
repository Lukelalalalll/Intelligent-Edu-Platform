import React from 'react';
import WelcomeBanner from '@/shared/components/WelcomeBanner';

import styles from './PptGeneratorShell.module.css';

export const PPT_GENERATOR_STEPS = [
    'Prepare Content',
    'Style Config',
    'Markdown Draft',
    'Preview & Edit',
    'Export Result',
] as const;

const PPT_GENERATOR_SUBTITLE =
    'Prepare your content, tune the visual style, refine the markdown draft, preview the deck, and export a polished result.';

interface PptGeneratorShellProps {
    currentStep: number;
    onStepSelect?: (stepIndex: number) => void;
    toolbar?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    dense?: boolean;
}

function joinClassNames(parts: Array<string | undefined | false | null>): string {
    return parts.filter(Boolean).join(' ');
}

export default function PptGeneratorShell({
    currentStep,
    onStepSelect,
    toolbar,
    children,
    className,
    contentClassName,
    dense = false,
}: PptGeneratorShellProps) {
    return (
        <div className={joinClassNames([styles.shell, dense && styles.shellDense, className])}>
            <WelcomeBanner
                title={<><i className="fas fa-file-powerpoint" aria-hidden="true"></i> PPT Generator</>}
                subtitle={PPT_GENERATOR_SUBTITLE}
                className={styles.banner}
                as="header"
                variant="workspace"
                collapseOnScroll={dense}
            />

            <div className={styles.stepperWrap} aria-label="PPT Generator steps">
                {PPT_GENERATOR_STEPS.map((label, index) => {
                    const isDone = index < currentStep;
                    const isActive = index === currentStep;
                    const isClickable = isDone && Boolean(onStepSelect);
                    const stepClassName = joinClassNames([
                        styles.stepperItem,
                        isDone && styles.stepperItemDone,
                        isActive && styles.stepperItemActive,
                        !isDone && !isActive && styles.stepperItemFuture,
                    ]);

                    if (isClickable) {
                        return (
                            <button
                                key={label}
                                type="button"
                                className={joinClassNames([styles.stepperButton, stepClassName])}
                                onClick={() => onStepSelect?.(index)}
                            >
                                <div className={styles.stepperCircle}>
                                    <i className="fas fa-check" aria-hidden="true" />
                                </div>
                                <span className={styles.stepperLabel}>{label}</span>
                            </button>
                        );
                    }

                    return (
                        <div
                            key={label}
                            className={stepClassName}
                            aria-current={isActive ? 'step' : undefined}
                            aria-disabled={!isActive ? 'true' : undefined}
                        >
                            <div className={styles.stepperCircle}>
                                <span>{index + 1}</span>
                            </div>
                            <span className={styles.stepperLabel}>{label}</span>
                        </div>
                    );
                })}
            </div>

            {toolbar ? <div className={styles.toolbarSlot}>{toolbar}</div> : null}

            <div className={joinClassNames([styles.content, contentClassName])}>{children}</div>
        </div>
    );
}
