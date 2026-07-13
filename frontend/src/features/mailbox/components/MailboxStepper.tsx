import React from 'react';
import styles from '../styles/mailbox.module.css';

interface Step {
    id: number;
    label: string;
    icon?: string;
}

interface MailboxStepperProps {
    currentStep: number;
    selections: { degree: string; course: string; assignment: string };
    onStepClick: (step: number) => void;
}

export default function MailboxStepper({ currentStep, selections, onStepClick }: MailboxStepperProps) {
    const steps: Step[] = [
        { id: 1, label: selections.degree || 'Degree Level' },
        { id: 2, label: selections.course || 'Course' },
        { id: 3, label: selections.assignment || 'Assignment' },
        { id: 4, label: 'Submissions', icon: 'fa-check' },
    ];

    return (
        <div className={styles.stepperWrapper}>
            {steps.map(step => {
                const isActive = currentStep === step.id;
                const isCompleted = currentStep > step.id;
                return (
                    <div
                        key={step.id}
                        className={`${styles.stepItem} ${isActive ? styles.stepActive : ''} ${isCompleted ? styles.stepCompleted : ''}`}
                        onClick={() => isCompleted && onStepClick(step.id)}
                    >
                        <div className={styles.stepIcon}>
                            {isCompleted || step.icon
                                ? <i className={`fas ${step.icon || 'fa-check'}`}></i>
                                : step.id}
                        </div>
                        <div className={styles.stepText}>{step.label}</div>
                    </div>
                );
            })}
        </div>
    );
}
