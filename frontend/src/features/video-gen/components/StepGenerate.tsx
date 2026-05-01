import { useEffect, useRef, useState } from 'react';
import styles from '../styles/videoGen.module.css';
import { videoApi } from '../api/videoApi';
import type { Scene } from '../data/themes';
import VideoPlayerWithChapters from './VideoPlayerWithChapters';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

interface ClipError {
    clip_index: number;
    stage: string;
    reason: string;
}

interface Props {
    inputData: { text?: string; file?: File; fileType?: string } | null;
    scenes: Scene[];
    lang: 'zh' | 'en';
    provider: string;
    audience: string;
    enableSubtitles: boolean;
    subtitleMode: 'hard_srt' | 'image_strip' | 'none';
    brandKit: 'none' | 'default';
    animationLevel: 'off' | 'basic' | 'high';
    ttsEngine: 'edge_tts' | 'cosyvoice';
    avatarMode: 'none' | 'wav2lip' | 'latentsync';
    avatarImagePath: string;
    quizEnabled: boolean;
    maxSegments: number;
    onTaskId: (id: string) => void;
    taskId: string | null;
    onBack: () => void;
}

export default function StepGenerate({
    inputData,
    scenes,
    lang,
    provider,
    audience,
    enableSubtitles,
    subtitleMode,
    brandKit,
    animationLevel,
    ttsEngine,
    avatarMode,
    avatarImagePath,
    quizEnabled,
    maxSegments,
    onTaskId,
    taskId,
    onBack,
}: Props) {
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [clipErrors, setClipErrors] = useState<ClipError[]>([]);
    const [quizUrl, setQuizUrl] = useState<string | undefined>(undefined);
    const [chaptersUrl, setChaptersUrl] = useState<string | undefined>(undefined);
    const cleanupRef = useRef<(() => void) | null>(null);

    const startGeneration = async () => {
        setStatus('running');
        setMessage('Starting...');
        setClipErrors([]);
        try {
            const cleanScenes = scenes.map(({ _imagePreviewUrl, _layoutImagePreviewUrl, ...rest }) => rest);
            const resolvedSubtitleMode = enableSubtitles ? subtitleMode : 'none';
            const res = await videoApi.generate(
                inputData!,
                cleanScenes,
                lang,
                provider,
                enableSubtitles,
                maxSegments,
                audience,
                resolvedSubtitleMode,
                brandKit,
                animationLevel,
                ttsEngine,
                avatarMode,
                quizEnabled,
                avatarImagePath || undefined,
            );
            onTaskId(res.taskId);
        } catch {
            setStatus('error');
            setMessage('Failed to start video generation.');
        }
    };

    // Subscribe to SSE (with automatic polling fallback) once taskId is available
    useEffect(() => {
        if (!taskId || status !== 'running') return;

        const cleanup = videoApi.progressSSE(
            taskId,
            (prog, msg) => {
                setProgress(prog);
                setMessage(msg);
            },
            (videoPath, warnings, meta) => {
                setStatus('done');
                setVideoUrl(`${apiRoot}/${videoPath}`);
                if (warnings.length > 0) setClipErrors(warnings as ClipError[]);
                if (meta?.quizPath) setQuizUrl(`${apiRoot}/${meta.quizPath}`);
                if (meta?.chaptersPath) setChaptersUrl(`${apiRoot}/${meta.chaptersPath}`);
            },
            (err, details) => {
                setStatus('error');
                setMessage(err);
                if (details && details.length > 0) setClipErrors(details as ClipError[]);
            },
        );
        cleanupRef.current = cleanup;
        return () => cleanup();
    }, [taskId, status]);

    return (
        <div className={styles.stepCard}>
            <div className={styles.stepTitle}>
                <div className={styles.stepIcon}><i className="fas fa-video" /></div>
                Generate Video
            </div>

            {status === 'idle' && (
                <>
                    <p className={styles.hint}>
                        Your <strong>{scenes.length}</strong>-scene teaching video will be generated on the server.
                        <br />
                        Language: <strong>{lang === 'zh' ? 'Chinese' : 'English'}</strong>
                        {' | '}Subtitles: <strong>{enableSubtitles ? 'ON' : 'OFF'}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className={styles.secondaryBtn} onClick={onBack}>
                            <i className="fas fa-arrow-left" /> Back
                        </button>
                        <button className={styles.primaryBtn} onClick={startGeneration}>
                            <i className="fas fa-video" /> Start Generating
                        </button>
                    </div>
                </>
            )}

            {status === 'running' && (
                <div className={styles.progressArea}>
                    <div className={styles.progressBar}>
                        <div style={{ width: `${progress}%` }} />
                    </div>
                    <p>{progress}% — {message}</p>
                </div>
            )}

            {status === 'done' && (
                <div className={styles.doneArea}>
                    <i className="fas fa-check-circle" style={{ color: '#22c55e', fontSize: 48 }} />
                    <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>Video ready!</p>
                    {clipErrors.length > 0 && (
                        <div className={styles.warnBox}>
                            <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
                            {clipErrors.length} clip(s) were skipped due to errors:
                            <ul style={{ margin: '6px 0 0 16px', fontSize: '0.85rem' }}>
                                {clipErrors.map(e => (
                                    <li key={e.clip_index}>
                                        <strong>Clip {e.clip_index + 1}</strong> [{e.stage}]: {e.reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <VideoPlayerWithChapters
                        videoUrl={videoUrl}
                        chaptersUrl={chaptersUrl}
                        quizUrl={quizUrl}
                    />
                    <a className={styles.primaryBtn} href={videoUrl} download>
                        <i className="fas fa-download" /> Download MP4
                    </a>
                </div>
            )}

            {status === 'error' && (
                <>
                    <p className={styles.errorTip}><i className="fas fa-exclamation-triangle" /> {message}</p>
                    {clipErrors.length > 0 && (
                        <div className={styles.warnBox} style={{ marginTop: 8 }}>
                            <strong>Clip-level errors:</strong>
                            <ul style={{ margin: '4px 0 0 16px', fontSize: '0.85rem' }}>
                                {clipErrors.map(e => (
                                    <li key={e.clip_index}>
                                        <strong>Clip {e.clip_index + 1}</strong> [{e.stage}]: {e.reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <button className={styles.secondaryBtn} onClick={() => { setStatus('idle'); setProgress(0); setClipErrors([]); }}>
                        <i className="fas fa-redo" /> Retry
                    </button>
                </>
            )}
        </div>
    );
}

