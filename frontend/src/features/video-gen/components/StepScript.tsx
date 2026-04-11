import { useEffect, useState } from 'react';
import styles from '../styles/videoGen.module.css';
import { videoApi } from '../api/videoApi';
import type { Scene } from '../data/themes';
import { createScene } from '../data/themes';

interface Props {
    inputData: { text?: string; file?: File; fileType?: string } | null;
    lang: 'zh' | 'en';
    provider: string;
    audience: string;
    maxSegments: number;
    onNext: (scenes: Scene[]) => void;
    onBack: () => void;
}

export default function StepScript({ inputData, lang, provider, audience, maxSegments, onNext, onBack }: Props) {
    const [scripts, setScripts] = useState<string[]>([]);
    const [slideContents, setSlideContents] = useState<Array<{
        title: string; bullets: string[];
        layoutType?: string; quoteText?: string;
        col1Title?: string; col1Bullets?: string[];
        col2Title?: string; col2Bullets?: string[];
    }>>([]);
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState('');
    const [error, setError] = useState('');

    const apiRoot = (import.meta.env.VITE_API_ROOT || 'http://localhost:5009').replace(/\/$/, '');

    useEffect(() => {
        let cancelled = false;
        let eventSource: EventSource | null = null;

        const optimizeAsync = async () => {
            try {
                setLoading(true);
                setError('');
                setProgress(0);
                setProgressMsg('Starting...');

                // Start async job
                const { jobId } = await videoApi.optimizeScriptAsync(inputData!, lang, provider, maxSegments, audience);

                // Get auth token for SSE
                const token = localStorage.getItem('token') || '';

                // Connect SSE
                eventSource = new EventSource(
                    `${apiRoot}/api/video/script-progress/${jobId}?token=${encodeURIComponent(token)}`
                );

                eventSource.onmessage = (evt) => {
                    if (cancelled) return;
                    try {
                        const data = JSON.parse(evt.data);
                        setProgress(data.progress || 0);
                        setProgressMsg(data.message || '');

                        if (data.status === 'done' && data.scripts) {
                            setScripts(data.scripts);
                            setSlideContents(data.slideContents || []);
                            setLoading(false);
                            eventSource?.close();
                        } else if (data.status === 'error') {
                            setError(data.message || 'Script generation failed');
                            setScripts(inputData?.text ? [inputData.text] : ['']);
                            setLoading(false);
                            eventSource?.close();
                        }
                    } catch { /* ignore parse error */ }
                };

                eventSource.onerror = () => {
                    if (cancelled) return;
                    // SSE connection failed — fall back to sync API
                    eventSource?.close();
                    fallbackSync();
                };
            } catch {
                if (!cancelled) fallbackSync();
            }
        };

        const fallbackSync = async () => {
            try {
                setProgressMsg('Generating (sync fallback)...');
                const res = await videoApi.optimizeScript(inputData!, lang, provider, maxSegments, audience);
                if (!cancelled) {
                    setScripts(res.scripts || []);
                    setSlideContents(res.slideContents || []);
                }
            } catch {
                if (!cancelled) {
                    setError('AI script generation failed. You can manually edit below or go back.');
                    setScripts(inputData?.text ? [inputData.text] : ['']);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        optimizeAsync();
        return () => {
            cancelled = true;
            eventSource?.close();
        };
    }, []);

    const updateScript = (idx: number, value: string) => {
        setScripts((prev) => {
            const next = [...prev];
            next[idx] = value;
            return next;
        });
    };

    const addSegment = () => setScripts((prev) => [...prev, '']);

    const removeSegment = (idx: number) => {
        if (scripts.length <= 1) return;
        setScripts((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleNext = () => {
        const filtered = scripts.filter((s) => s.trim());
        const scenes: Scene[] = filtered.map((s, i) => {
            const sc = createScene(s, i);
            // Apply AI-generated slide content if available
            const content = slideContents[i];
            if (content) {
                sc.slideTitle = content.title || sc.slideTitle;
                sc.slideBody = (content.bullets || []).map(b => `• ${b}`).join('\n');
                // V2 layout type from AI recommendation
                const validLayouts = ['title-bullets', 'image-left', 'image-right', 'image-top', 'big-quote', 'two-column'];
                if (content.layoutType && validLayouts.includes(content.layoutType)) {
                    sc.layoutType = content.layoutType as Scene['layoutType'];
                }
                if (content.quoteText) sc.quoteText = content.quoteText;
                if (content.col1Title) sc.col1Title = content.col1Title;
                if (content.col1Bullets) sc.col1Bullets = content.col1Bullets;
                if (content.col2Title) sc.col2Title = content.col2Title;
                if (content.col2Bullets) sc.col2Bullets = content.col2Bullets;
            }
            return sc;
        });
        onNext(scenes);
    };

    return (
        <div className={styles.stepCard}>
            <h3>Step 2: AI-Optimized Script</h3>

            {loading ? (
                <div className={styles.progressArea}>
                    <div className={styles.progressBar}>
                        <div style={{ width: `${progress}%` }} />
                    </div>
                    <p>{progress}% — {progressMsg || 'Generating narration script with AI...'}</p>
                </div>
            ) : (
                <>
                    {error && <p className={styles.errorTip}>{error}</p>}
                    <p className={styles.hint}>
                        Each segment becomes one video slide with narration. Edit, add, or remove segments as needed.
                    </p>

                    <div className={styles.scriptScrollWrap}>
                        {scripts.map((s, i) => (
                            <div key={i} className={styles.scriptBlock}>
                                <div className={styles.scriptLabel}>
                                    Segment {i + 1}
                                    {scripts.length > 1 && (
                                        <button
                                            style={{ marginLeft: 8, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}
                                            onClick={() => removeSegment(i)}
                                        >
                                            <i className="fas fa-trash-alt" /> Remove
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    value={s}
                                    rows={4}
                                    onChange={(e) => updateScript(i, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className={styles.secondaryBtn} onClick={onBack}>
                                <i className="fas fa-arrow-left" /> Back
                            </button>
                            <button className={styles.secondaryBtn} onClick={addSegment}>
                                <i className="fas fa-plus" /> Add Segment
                            </button>
                        </div>
                        <button
                            className={styles.primaryBtn}
                            onClick={handleNext}
                            disabled={scripts.every((s) => !s.trim())}
                        >
                            Next: Scene Editor <i className="fas fa-arrow-right" />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
