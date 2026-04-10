// frontend/src/pages/sub2/QuestionGenerator.jsx
import React, { useState } from 'react';
import Step1Upload from './components/Step1Upload';
import Step2Extract from './components/Step2Extract';
import Step3Generate from './components/Step3Generate';
import HistoryPanel from './components/HistoryPanel';
import Button from '../../components/ui/Button/Button';
import Card from '../../components/ui/Card/Card';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import styles from './styles/sub2.module.css';

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
              利用 && 条件渲染实现“替换”效果。
              当状态改变时，旧卡片会被卸载，新卡片会在相同位置渲染，避免了页面一直往下滑动。
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