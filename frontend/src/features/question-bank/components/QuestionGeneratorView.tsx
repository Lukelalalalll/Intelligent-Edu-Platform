import { useMemo } from 'react';
import { BookCopy, Bot, CheckCircle2, ScrollText, Sparkles } from 'lucide-react';

import PptGeneratorShell, { type PptGeneratorStep } from '@/features/slides/components/PptGeneratorShell';
import Button from '@/shared/components/Button/Button';

import type { QuestionGeneratorController } from '../hooks/useQuestionGenerator';
import styles from '../styles/questionStudio.module.css';
import QuestionGeneratorWorkspace from './workspace/QuestionGeneratorWorkspace';

interface QuestionGeneratorViewProps {
    controller: QuestionGeneratorController;
}

export default function QuestionGeneratorView({ controller }: QuestionGeneratorViewProps) {
    const { state, derived, actions } = controller;
    const shellSteps = useMemo<PptGeneratorStep[]>(() => ([
        { key: 'start', label: 'Start', icon: <Sparkles size={16} /> },
        { key: 'composer', label: 'Compose', icon: <ScrollText size={16} /> },
        { key: 'result', label: 'Review & Export', icon: <CheckCircle2 size={16} /> },
    ]), []);

    const toolbar = (
        <div className={styles.toolbarSwitch}>
            <Button type="button" variant={state.view === 'hub' ? 'primary' : 'outline'} onClick={() => actions.setView('hub')}>
                <BookCopy size={16} /> Studio
            </Button>
            <Button
                type="button"
                variant={state.view === 'generate' ? 'primary' : 'outline'}
                onClick={() => {
                    actions.setView('generate');
                    actions.setWorkspaceStep((current) => (
                        current === 'result' || current === 'composer' ? current : 'start'
                    ));
                }}
            >
                <Bot size={16} /> Generate
            </Button>
        </div>
    );

    return (
        <PptGeneratorShell
            className="container"
            currentStep={derived.currentStepIndex}
            showStepper={state.view === 'generate'}
            steps={shellSteps}
            toolbar={toolbar}
            contentClassName={styles.shellContent}
            bannerTitle={<><Sparkles size={20} /> Question Studio</>}
            bannerSubtitle="Generate polished question sets from text, PDF source material, or both, then review, edit, and export them with math-safe rendering."
        >
            <QuestionGeneratorWorkspace controller={controller} />
        </PptGeneratorShell>
    );
}
