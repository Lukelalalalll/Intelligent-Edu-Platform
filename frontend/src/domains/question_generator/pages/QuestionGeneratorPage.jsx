// frontend/src/pages/sub2/QuestionGenerator.jsx
import React, { useEffect, useState } from 'react';
import Step1Upload from './components/Step1Upload';
import Step2Extract from './components/Step2Extract';
import Step3Generate from './components/Step3Generate';
import styles from '../../styles/sub2/sub2.module.css';

export default function QuestionGenerator({ states, handlers }) {
    const currentStep = states.currentStep || 1;
    const [animationKey, setAnimationKey] = useState(0);

    useEffect(() => {
        setAnimationKey((k) => k + 1);
    }, [currentStep]);

    const showStep1 = states.currentStep === 1;
    const showStep2 = states.currentStep === 2;
    const showStep3 = states.currentStep === 3;

    const stepItems = [
        { step: 1, title: 'Upload', icon: 'fa-upload' },
        { step: 2, title: 'Extract', icon: 'fa-search' },
        { step: 3, title: 'Generate', icon: 'fa-robot' },
    ];

    return (
        <div className="container">
            <div className="page-header">
                <h1>Intelligent Question Extraction and Generation</h1>
                <p className="subtitle">Extract question content from PDF and intelligently generate new practice exercises</p>
            </div>

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

            <div key={animationKey} className={styles.stepView}>

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
        </div>
    );
}