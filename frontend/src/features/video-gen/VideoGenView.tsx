import React, { useState } from 'react';
import StepUpload from './components/StepUpload';
import StepScript from './components/StepScript';
import StepSceneEditor from './components/StepSceneEditor';
import StepGenerate from './components/StepGenerate';
import WelcomeBanner from '../../shared/components/WelcomeBanner';
import type { Scene } from './data/themes';
import styles from './styles/videoGen.module.css';

const STEPS = [
    { label: 'Input', icon: 'fa-upload' },
    { label: 'Script', icon: 'fa-scroll' },
    { label: 'Scene Editor', icon: 'fa-palette' },
    { label: 'Generate', icon: 'fa-video' },
];

export type AIProvider = 'coze' | 'local_ollama';
export type Audience = 'student' | 'teacher' | 'researcher' | 'general';

export default function VideoGenView({ viewSwitchSlot, hideBanner }: { viewSwitchSlot?: React.ReactNode; hideBanner?: boolean } = {}) {
    const [step, setStep] = useState(0);
    const [lang, setLang] = useState<'zh' | 'en'>('zh');
    const [provider, setProvider] = useState<AIProvider>('local_ollama');
    const [audience, setAudience] = useState<Audience>('student');
    const [enableSubtitles, setEnableSubtitles] = useState(true);
    const [maxSegments, setMaxSegments] = useState(8);
    const [inputData, setInputData] = useState<{ text?: string; file?: File; fileType?: string } | null>(null);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [taskId, setTaskId] = useState<string | null>(null);

    const goToStep = (target: number) => {
        if (target < step) setStep(target);
    };

    return (
        <div className={styles.page}>
            {!hideBanner && (
                <WelcomeBanner
                    className={styles.videoBanner}
                    title="AI Teaching Video Generator"
                    subtitle="Upload content, generate narration scripts, customise scenes and create teaching videos"
                />
            )}

            {!hideBanner && viewSwitchSlot}

            {/* Stepper (sub2 style) */}
            <div className={styles.stepperWrap}>
                {STEPS.map((s, i) => {
                    const active = step === i;
                    const done = step > i;
                    return (
                        <div
                            key={s.label}
                            className={`${styles.stepperItem} ${active ? styles.stepperItemActive : ''} ${done ? styles.stepperItemDone : ''}`}
                            onClick={() => goToStep(i)}
                        >
                            <div className={styles.stepperCircle}>
                                {done ? <i className="fas fa-check" /> : <i className={`fas ${s.icon}`} />}
                            </div>
                            <div className={styles.stepperLabel}>{s.label}</div>
                        </div>
                    );
                })}
            </div>

            <div className={styles.stepView} key={step}>
                {step === 0 && (
                    <StepUpload
                        lang={lang}
                        setLang={setLang}
                        provider={provider}
                        setProvider={setProvider}
                        audience={audience}
                        setAudience={setAudience}
                        enableSubtitles={enableSubtitles}
                        setEnableSubtitles={setEnableSubtitles}
                        maxSegments={maxSegments}
                        setMaxSegments={setMaxSegments}
                        onNext={(data) => { setInputData(data); setStep(1); }}
                    />
                )}
                {step === 1 && (
                    <StepScript
                        inputData={inputData}
                        lang={lang}
                        provider={provider}
                        audience={audience}
                        maxSegments={maxSegments}
                        onNext={(s) => { setScenes(s); setStep(2); }}
                        onBack={() => setStep(0)}
                    />
                )}
                {step === 2 && (
                    <StepSceneEditor
                        scenes={scenes}
                        setScenes={setScenes}
                        subtitles={enableSubtitles}
                        onNext={() => setStep(3)}
                        onBack={() => setStep(1)}
                    />
                )}
                {step === 3 && (
                    <StepGenerate
                        inputData={inputData}
                        scenes={scenes}
                        lang={lang}
                        provider={provider}
                        audience={audience}
                        enableSubtitles={enableSubtitles}
                        maxSegments={maxSegments}
                        onTaskId={setTaskId}
                        taskId={taskId}
                        onBack={() => setStep(2)}
                    />
                )}
            </div>
        </div>
    );
}
