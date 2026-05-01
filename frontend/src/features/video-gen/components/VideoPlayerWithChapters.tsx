/**
 * VideoPlayerWithChapters — Video player with chapter navigation sidebar
 * and per-scene quiz pop-up overlay (Phase 3.2).
 *
 * Props:
 *   videoUrl     — direct URL to the MP4
 *   chaptersUrl  — URL to chapters.json  (optional)
 *   quizUrl      — URL to quiz_markers.json (optional)
 */
import { useEffect, useRef, useState } from 'react';

interface Chapter {
    time: number;
    title: string;
}

interface QuizMarker {
    time: number;
    question: string;
    options: string[];
    answer: number;
}

interface Props {
    videoUrl: string;
    chaptersUrl?: string;
    quizUrl?: string;
}

const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
};

export default function VideoPlayerWithChapters({ videoUrl, chaptersUrl, quizUrl }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [quizMarkers, setQuizMarkers] = useState<QuizMarker[]>([]);
    const [activeQuiz, setActiveQuiz] = useState<QuizMarker | null>(null);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [answered, setAnswered] = useState(false);
    // Track which quiz markers have already been shown
    const shownQuizRef = useRef<Set<number>>(new Set());

    // Load chapters.json
    useEffect(() => {
        if (!chaptersUrl) return;
        fetch(chaptersUrl)
            .then(r => r.json())
            .then(data => setChapters(Array.isArray(data) ? data : []))
            .catch(() => setChapters([]));
    }, [chaptersUrl]);

    // Load quiz_markers.json
    useEffect(() => {
        if (!quizUrl) return;
        fetch(quizUrl)
            .then(r => r.json())
            .then(data => setQuizMarkers(Array.isArray(data) ? data : []))
            .catch(() => setQuizMarkers([]));
    }, [quizUrl]);

    // Poll video currentTime to trigger quiz pop-ups
    useEffect(() => {
        if (quizMarkers.length === 0) return;
        const video = videoRef.current;
        if (!video) return;

        const onTimeUpdate = () => {
            const t = video.currentTime;
            for (const marker of quizMarkers) {
                // Show quiz when we reach within 0.5s of the marker time
                if (
                    t >= marker.time &&
                    t < marker.time + 1.5 &&
                    !shownQuizRef.current.has(marker.time)
                ) {
                    shownQuizRef.current.add(marker.time);
                    video.pause();
                    setActiveQuiz(marker);
                    setSelectedOption(null);
                    setAnswered(false);
                    break;
                }
            }
        };

        video.addEventListener('timeupdate', onTimeUpdate);
        return () => video.removeEventListener('timeupdate', onTimeUpdate);
    }, [quizMarkers]);

    const seekTo = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            videoRef.current.play();
        }
    };

    const dismissQuiz = () => {
        setActiveQuiz(null);
        videoRef.current?.play();
    };

    const submitAnswer = () => {
        if (selectedOption === null) return;
        setAnswered(true);
    };

    const hasExtras = chapters.length > 0 || quizMarkers.length > 0;

    return (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Video */}
            <div style={{ position: 'relative', flex: '1 1 480px' }}>
                <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    style={{ width: '100%', borderRadius: 12, display: 'block' }}
                />

                {/* Quiz overlay */}
                {activeQuiz && (
                    <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)',
                        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10, padding: 24,
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480,
                            width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        }}>
                            <p style={{ fontWeight: 700, marginBottom: 12, fontSize: '1rem', color: '#1e293b' }}>
                                <i className="fas fa-question-circle" style={{ color: '#6366f1', marginRight: 8 }} />
                                {activeQuiz.question}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {activeQuiz.options.map((opt, i) => {
                                    let bg = '#f1f5f9';
                                    let color = '#1e293b';
                                    if (answered) {
                                        if (i === activeQuiz.answer) { bg = '#dcfce7'; color = '#166534'; }
                                        else if (i === selectedOption) { bg = '#fee2e2'; color = '#991b1b'; }
                                    } else if (i === selectedOption) {
                                        bg = '#e0e7ff'; color = '#3730a3';
                                    }
                                    return (
                                        <button
                                            key={i}
                                            disabled={answered}
                                            onClick={() => !answered && setSelectedOption(i)}
                                            style={{
                                                background: bg, color, border: 'none', borderRadius: 8,
                                                padding: '8px 14px', textAlign: 'left', cursor: answered ? 'default' : 'pointer',
                                                fontWeight: i === selectedOption || (answered && i === activeQuiz.answer) ? 600 : 400,
                                                fontSize: '0.9rem',
                                            }}
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                                {!answered ? (
                                    <>
                                        <button
                                            onClick={dismissQuiz}
                                            style={{ background: '#e2e8f0', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}
                                        >
                                            Skip
                                        </button>
                                        <button
                                            onClick={submitAnswer}
                                            disabled={selectedOption === null}
                                            style={{
                                                background: selectedOption === null ? '#c7d2fe' : '#6366f1',
                                                color: '#fff', border: 'none', borderRadius: 8,
                                                padding: '7px 16px', cursor: selectedOption === null ? 'default' : 'pointer',
                                            }}
                                        >
                                            Submit
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={dismissQuiz}
                                        style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', cursor: 'pointer' }}
                                    >
                                        Continue
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Chapters sidebar */}
            {hasExtras && (
                <div style={{
                    flex: '0 0 220px', background: '#f8fafc', borderRadius: 12,
                    border: '1px solid #e2e8f0', padding: '12px 0', maxHeight: 400,
                    overflowY: 'auto',
                }}>
                    {chapters.length > 0 && (
                        <>
                            <p style={{ fontWeight: 700, fontSize: '0.82rem', color: '#64748b', padding: '0 14px 6px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Chapters
                            </p>
                            {chapters.map((ch, i) => (
                                <button
                                    key={i}
                                    onClick={() => seekTo(ch.time)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        width: '100%', background: 'none', border: 'none',
                                        textAlign: 'left', padding: '7px 14px', cursor: 'pointer',
                                        fontSize: '0.85rem', color: '#1e293b',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#e0e7ff')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                >
                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem', minWidth: 32 }}>{fmt(ch.time)}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.title}</span>
                                </button>
                            ))}
                        </>
                    )}
                    {quizMarkers.length > 0 && (
                        <>
                            <p style={{ fontWeight: 700, fontSize: '0.82rem', color: '#64748b', padding: '10px 14px 6px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {quizMarkers.length} Quiz{quizMarkers.length > 1 ? 'zes' : ''}
                            </p>
                            {quizMarkers.map((qm, i) => (
                                <div
                                    key={i}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', fontSize: '0.83rem', color: '#64748b' }}
                                >
                                    <i className="fas fa-question-circle" style={{ color: '#a5b4fc', fontSize: '0.75rem' }} />
                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{fmt(qm.time)}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                                        {qm.question.slice(0, 40)}{qm.question.length > 40 ? '…' : ''}
                                    </span>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
