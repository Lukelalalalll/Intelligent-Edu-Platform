// frontend/src/features/question-bank/components/QuestionGeneratorView.tsx
import React, { useState } from 'react';
import Step1Upload from './Step1Upload';
import Step2Extract from './Step2Extract/Step2Extract';
import Step3Generate from './Step3Generate/Step3Generate';
import HistoryPanel from './HistoryPanel';
import Button from '@/shared/components/Button/Button';
import Card from '@/shared/components/Card/Card';
import WelcomeBanner from '@/shared/components/WelcomeBanner';
import styles from '../styles/questionBank.module.css';

export default function QuestionGenerator({ states, handlers }) {
    const [activeView, setActiveView] = useState('workflow');
    const currentStep = states.currentStep || 1;

    const showStep1 = states.currentStep === 1;
    const showStep2 = states.currentStep === 2;
    const showStep3 = states.currentStep === 3;

    const stepItems = [
        { step: 1, title: 'Upload', icon: 'fa-upload' },
        { step: 2, title: 'Prepare Source', icon: 'fa-search' },
        { step: 3, title: 'Generate', icon: 'fa-robot' },
    ];

    const handleHistoryReplay = async (historyItem) => {
        if (handlers.replayFromHistory) {
            await handlers.replayFromHistory(historyItem);
        }
        setActiveView('workflow');
    };

    return (
        <div className="container">
            <WelcomeBanner
                className={styles.sub2Banner}
                title="Intelligent Question Extraction and Generation"
                subtitle="Extract question content from PDF and intelligently generate new practice exercises"
                variant="workspace"
            />

            <div className={styles.viewSwitch}>
                <Button
                    type="button"
                    variant={activeView === 'workflow' ? 'primary' : 'outline'}
                    onClick={() => setActiveView('workflow')}
                >
                    <i className="fas fa-diagram-project"></i> Workflow
                </Button>
                <Button
                    type="button"
                    variant={activeView === 'history' ? 'primary' : 'outline'}
                    onClick={() => setActiveView('history')}
                >
                    <i className="fas fa-history"></i> History
                </Button>
            </div>

            {activeView === 'workflow' && (
                <>
                    <div className={styles.stepperWrap}>
                        {stepItems.map((item) => {
                            const active = currentStep === item.step;
                            const done = currentStep > item.step;

                            const handleClick = () => {
                                if (!done) return;
                                if (item.step === 1) handlers.goToStep1();
                                if (item.step === 2) handlers.goToStep2();
                                if (item.step === 3) handlers.goToStep3();
                            };

                            return (
                                <div
                                    key={item.step}
                                    className={`${styles.stepperItem} ${active ? styles.stepperItemActive : ''} ${done ? styles.stepperItemDone : ''}`}
                                    onClick={handleClick}
                                >
                                    <div className={styles.stepperCircle}>
                                        {done ? <i className="fas fa-check"></i> : <i className={`fas ${item.icon}`}></i>}
                                    </div>
                                    <div className={styles.stepperLabel}>{item.title}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div key={currentStep} className={styles.stepView}>

                        {/*
              Uses && conditional rendering for a "swap" effect.
              When the step changes, the old card unmounts and the new one renders in place,
              preventing the page from scrolling down continuously.
            */}

                        {/* Step 1: File Upload */}
                        {showStep1 && (
                            <Step1Upload states={states} handlers={handlers} />
                        )}

                        {/* Step 2: Content Extraction */}
                        {showStep2 && (
                            <Step2Extract states={states} handlers={handlers} />
                        )}

                        {/* Step 3: Question Generation */}
                        {showStep3 && (
                            <Step3Generate states={states} handlers={handlers} />
                        )}

                    </div>
                </>
            )}

            {activeView === 'history' && (
                <Card className={styles.historyViewCard} glass>
                    <HistoryPanel onReplay={handleHistoryReplay} />
                </Card>
            )}
        </div>
    );
}
