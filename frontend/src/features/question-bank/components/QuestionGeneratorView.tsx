import { useMemo } from 'react';
import { CheckCircle2, FileText, Sparkles } from 'lucide-react';

import PptGeneratorShell, { type PptGeneratorStep } from '@/features/slides/components/PptGeneratorShell';

import type { QuestionGeneratorController } from '../hooks/useQuestionGenerator';
import styles from '../styles/questionStudio.module.css';
import QuestionGeneratorWorkspace from './workspace/QuestionGeneratorWorkspace';

interface QuestionGeneratorViewProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorView({ controller }: QuestionGeneratorViewProps) {
    const { state, derived, actions } = controller;
    const shellSteps = useMemo<PptGeneratorStep[]>(() => ([
        { key: 'composer', label: 'Compose', icon: <FileText size={16} /> },
        { key: 'result', label: 'Preview & Export', icon: <CheckCircle2 size={16} /> },
    ]), []);

    return (
        <PptGeneratorShell
            className="container"
            currentStep={derived.currentStepIndex}
            onStepSelect={(stepIndex) => {
                if (stepIndex === 0) {
                    actions.setWorkspaceStep('composer');
                }
                if (stepIndex === 1) {
                    actions.setWorkspaceStep('result');
                }
            }}
            showStepper
            steps={shellSteps}
            contentClassName={styles.shellContent}
            bannerTitle={<><Sparkles size={20} /> Question Studio</>}
            bannerSubtitle="Write a prompt, attach a PDF, choose an AI Config model, and generate an editable markdown question set with math-safe preview."
        >
            <QuestionGeneratorWorkspace controller={controller} />
        </PptGeneratorShell>
    );
}
