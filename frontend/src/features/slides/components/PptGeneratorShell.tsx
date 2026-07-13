import React from 'react';
import { motion } from 'framer-motion';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css';
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance';

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

export interface PptGeneratorStep {
    key: string;
    label: React.ReactNode;
    isClickable?: boolean;
    icon?: React.ReactNode;
}

export interface PptGeneratorShellProps {
    currentStep: number;
    onStepSelect?: (stepIndex: number) => void;
    stepperLeading?: React.ReactNode;
    topRailMode?: 'split' | 'unified';
    showStepper?: boolean;
    steps?: PptGeneratorStep[];
    renderStep?: (step: PptGeneratorStep, stepIndex: number, state: { isDone: boolean; isActive: boolean; isClickable: boolean }) => React.ReactNode;
    toolbar?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    dense?: boolean;
    bannerTitle?: React.ReactNode;
    bannerSubtitle?: React.ReactNode;
    bannerClassName?: string;
    bannerStyle?: React.CSSProperties;
    bannerVariant?: 'workspace' | 'hero';
    compactStepper?: boolean;
}

function joinClassNames(parts: Array<string | undefined | false | null>): string {
    return parts.filter(Boolean).join(' ');
}

function measureRailMetrics(
    topRailRef: React.RefObject<HTMLDivElement | null>,
    leadingRef: React.RefObject<HTMLDivElement | null>,
): { expandedWidth: number; leadingWidth: number } {
    return {
        expandedWidth: Math.round(topRailRef.current?.getBoundingClientRect().width ?? 0),
        leadingWidth: Math.round(leadingRef.current?.getBoundingClientRect().width ?? 0),
    };
}

export default function PptGeneratorShell({
    currentStep,
    onStepSelect,
    stepperLeading,
    topRailMode = 'split',
    showStepper = true,
    steps,
    renderStep,
    toolbar,
    children,
    className,
    contentClassName,
    dense = false,
    bannerTitle,
    bannerSubtitle,
    bannerClassName,
    bannerStyle,
    bannerVariant = 'workspace',
    compactStepper = false,
}: PptGeneratorShellProps) {
    const isEntranceActive = usePageEntrance();
    const railSpring = { type: 'spring', stiffness: 260, damping: 30, mass: 0.92 } as const;
    const railTiming = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const } as const;
    const railInset = showStepper ? 24 : 10;
    const railGap = showStepper ? 24 : 0;
    const topRailRef = React.useRef<HTMLDivElement | null>(null);
    const leadingRef = React.useRef<HTMLDivElement | null>(null);
    const [railMetrics, setRailMetrics] = React.useState({ expandedWidth: 0, leadingWidth: 0 });
    const stepItems = React.useMemo<PptGeneratorStep[]>(() => (
        steps ?? PPT_GENERATOR_STEPS.map((label, index) => ({
            key: label,
            label,
            isClickable: index < currentStep,
        }))
    ), [currentStep, steps]);
    const collapsedRailWidth = railMetrics.leadingWidth > 0
        ? Math.ceil(railMetrics.leadingWidth + railInset * 2 + 2)
        : 0;
    const targetRailWidth = showStepper ? railMetrics.expandedWidth : collapsedRailWidth;

    React.useLayoutEffect(() => {
        const updateRailMetrics = () => {
            setRailMetrics(measureRailMetrics(topRailRef, leadingRef));
        };

        updateRailMetrics();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateRailMetrics);
            return () => window.removeEventListener('resize', updateRailMetrics);
        }

        const observer = new ResizeObserver(() => {
            updateRailMetrics();
        });

        if (topRailRef.current) {
            observer.observe(topRailRef.current);
        }
        if (leadingRef.current) {
            observer.observe(leadingRef.current);
        }

        return () => observer.disconnect();
    }, [stepperLeading]);

    const renderSteps = () => (
        stepItems.map((step, index) => {
            const isDone = index < currentStep;
            const isActive = index === currentStep;
            const isClickable = Boolean(step.isClickable ?? isDone) && Boolean(onStepSelect);
            const stepClassName = joinClassNames([
                styles.stepperItem,
                isDone && styles.stepperItemDone,
                isActive && styles.stepperItemActive,
                !isDone && !isActive && styles.stepperItemFuture,
            ]);

            if (renderStep) {
                const customNode = renderStep(step, index, { isDone, isActive, isClickable });
                if (customNode) return <React.Fragment key={step.key}>{customNode}</React.Fragment>;
            }

            if (isClickable) {
                return (
                    <button
                        key={step.key}
                        type="button"
                        className={joinClassNames([styles.stepperButton, stepClassName])}
                        onClick={() => onStepSelect?.(index)}
                    >
                        <div className={styles.stepperCircle}>
                            {step.icon ?? <i className="fas fa-check" aria-hidden="true" />}
                        </div>
                        <span className={styles.stepperLabel}>{step.label}</span>
                    </button>
                );
            }

            return (
                <div
                    key={step.key}
                    className={stepClassName}
                    aria-current={isActive ? 'step' : undefined}
                    aria-disabled={!isActive ? 'true' : undefined}
                >
                    <div className={styles.stepperCircle}>
                        {step.icon ?? <span>{index + 1}</span>}
                    </div>
                    <span className={styles.stepperLabel}>{step.label}</span>
                </div>
            );
        })
    );

    return (
        <div
            className={joinClassNames([
                styles.shell,
                dense && styles.shellDense,
                entranceStyles.pageEntrance,
                isEntranceActive && entranceStyles.pageEntranceActive,
                className,
            ])}
        >
            <WelcomeBanner
                title={bannerTitle ?? <><i className="fas fa-file-powerpoint" aria-hidden="true"></i> PPT Generator</>}
                subtitle={bannerSubtitle ?? PPT_GENERATOR_SUBTITLE}
                className={joinClassNames([styles.banner, bannerClassName])}
                style={bannerStyle}
                as="header"
                variant={bannerVariant}
            />

            <div
                ref={topRailMode === 'unified' ? topRailRef : undefined}
                className={joinClassNames([styles.topRail, topRailMode === 'unified' && styles.topRailUnified])}
            >
                {topRailMode === 'unified' ? (
                    <motion.div
                        initial={false}
                        transition={{
                            width: railTiming,
                            paddingLeft: railTiming,
                            paddingRight: railTiming,
                            gap: railTiming,
                            layout: railSpring,
                        }}
                        className={joinClassNames([
                            styles.stepperWrap,
                            styles.stepperWrapUnified,
                            !showStepper && styles.stepperWrapUnifiedCentered,
                        ])}
                        animate={{
                            width: targetRailWidth || 'auto',
                            paddingLeft: railInset,
                            paddingRight: railInset,
                            gap: railGap,
                        }}
                    >
                        {stepperLeading ? (
                            <motion.div
                                ref={leadingRef}
                                layout
                                transition={railSpring}
                                className={styles.topRailUnifiedLeading}
                                animate={{ marginRight: showStepper ? 6 : 0 }}
                                initial={false}
                                style={{ willChange: 'margin-right, transform, opacity' }}
                            >
                                {stepperLeading}
                            </motion.div>
                        ) : null}
                        <motion.div
                            layout
                            animate={showStepper ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: 14, scale: 0.99 }}
                            transition={{
                                opacity: railTiming,
                                x: railTiming,
                                scale: railTiming,
                                layout: railSpring,
                            }}
                            className={joinClassNames([
                                styles.stepperGroup,
                                !showStepper && styles.stepperGroupCollapsed,
                            ])}
                            aria-label={showStepper ? 'PPT Generator steps' : undefined}
                            aria-hidden={!showStepper}
                        >
                            {renderSteps()}
                        </motion.div>
                    </motion.div>
                ) : (
                    <>
                        {stepperLeading ? <div className={styles.topRailLeading}>{stepperLeading}</div> : null}
                        <div
                            className={joinClassNames([
                                styles.stepperWrap,
                                compactStepper && styles.stepperWrapCompact,
                            ])}
                            aria-label="PPT Generator steps"
                        >
                            {renderSteps()}
                        </div>
                    </>
                )}
            </div>

            {toolbar ? <div className={styles.toolbarSlot}>{toolbar}</div> : null}

            <div className={joinClassNames([styles.content, contentClassName])}>{children}</div>
        </div>
    );
}
