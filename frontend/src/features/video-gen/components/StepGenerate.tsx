import { useEffect, useRef, useState } from 'react';
import styles from '../styles/videoGen.module.css';
import { videoApi } from '../api/videoApi';
import type { Scene } from '../data/themes';

const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

interface Props {
    inputData: { text?: string; file?: File; fileType?: string } | null;
    scenes: Scene[];
    lang: 'zh' | 'en';
    provider: string;
    audience: string;
    enableSubtitles: boolean;
    maxSegments: number;
    onTaskId: (id: string) => void;
    taskId: string | null;
    onBack: () => void;
}

export default function StepGenerate({ inputData, scenes, lang, provider, audience, enableSubtitles, maxSegments, onTaskId, taskId, onBack }: Props) {
    const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startGeneration = async () => {
        setStatus('running');
        setMessage('Starting...');
        try {
            // Strip frontend-only fields before sending
            const cleanScenes = scenes.map(({ _imagePreviewUrl, ...rest }) => rest);
            const res = await videoApi.generate(inputData!, cleanScenes, lang, provider, enableSubtitles, maxSegments, audience);
            onTaskId(res.taskId);
        } catch {
            setStatus('error');
            setMessage('Failed to start video generation.');
        }
    };

    useEffect(() => {
        if (!taskId || status !== 'running') return;
        pollRef.current = setInterval(async () => {
            try {
                const task = await videoApi.status(taskId);
                setProgress(task.progress || 0);
                setMessage(task.message || '');
                if (task.status === 'done') {
                    clearInterval(pollRef.current!);
                    setStatus('done');
                    setVideoUrl(`${apiRoot}/${task.videoPath}`);
                } else if (task.status === 'error') {
                    clearInterval(pollRef.current!);
                    setStatus('error');
                    setMessage(task.error || 'Unknown error');
                }
            } catch {
                // ignore transient poll failures
            }
        }, 2500);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [taskId, status]);

    return (
        <div className={styles.stepCard}>
            <h3>Step 4: Generate Video</h3>

            {status === 'idle' && (
                <>
                    <p className={styles.hint}>
                        Your <strong>{scenes.length}</strong>-scene teaching video will be generated on the server.
                        <br />
                        Language: <strong>{lang === 'zh' ? '中文' : 'English'}</strong>
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
                    <video src={videoUrl} controls width="640" style={{ borderRadius: 12 }} />
                    <a className={styles.primaryBtn} href={videoUrl} download>
                        <i className="fas fa-download" /> Download MP4
                    </a>
                </div>
            )}

            {status === 'error' && (
                <>
                    <p className={styles.errorTip}><i className="fas fa-exclamation-triangle" /> {message}</p>
                    <button className={styles.secondaryBtn} onClick={() => { setStatus('idle'); setProgress(0); }}>
                        <i className="fas fa-redo" /> Retry
                    </button>
                </>
            )}
        </div>
    );
}
