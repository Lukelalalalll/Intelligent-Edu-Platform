import { useState } from 'react';
import styles from '../styles/videoGen.module.css';
import { videoApi } from '../api/videoApi';
import type {
    AIProvider,
    Audience,
    SubtitleMode,
    BrandKit,
    AnimationLevel,
    TTSEngine,
    AvatarMode,
} from '../components/VideoGenView';

interface Props {
    lang: 'zh' | 'en';
    setLang: (l: 'zh' | 'en') => void;
    provider: AIProvider;
    setProvider: (p: AIProvider) => void;
    audience: Audience;
    setAudience: (a: Audience) => void;
    enableSubtitles: boolean;
    setEnableSubtitles: (v: boolean) => void;
    subtitleMode: SubtitleMode;
    setSubtitleMode: (m: SubtitleMode) => void;
    brandKit: BrandKit;
    setBrandKit: (k: BrandKit) => void;
    animationLevel: AnimationLevel;
    setAnimationLevel: (a: AnimationLevel) => void;
    ttsEngine: TTSEngine;
    setTtsEngine: (e: TTSEngine) => void;
    avatarMode: AvatarMode;
    setAvatarMode: (m: AvatarMode) => void;
    avatarImagePath: string;
    setAvatarImagePath: (p: string) => void;
    quizEnabled: boolean;
    setQuizEnabled: (v: boolean) => void;
    maxSegments: number;
    setMaxSegments: (n: number) => void;
    onNext: (data: { text?: string; file?: File; fileType?: string }) => void;
}

export default function StepUpload({
    lang,
    setLang,
    provider,
    setProvider,
    audience,
    setAudience,
    enableSubtitles,
    setEnableSubtitles,
    subtitleMode,
    setSubtitleMode,
    brandKit,
    setBrandKit,
    animationLevel,
    setAnimationLevel,
    ttsEngine,
    setTtsEngine,
    avatarMode,
    setAvatarMode,
    avatarImagePath,
    setAvatarImagePath,
    quizEnabled,
    setQuizEnabled,
    maxSegments,
    setMaxSegments,
    onNext,
}: Props) {
    const [mode, setMode] = useState<'text' | 'file'>('text');
    const [text, setText] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    const handleAvatarUpload = async (f: File) => {
        setAvatarUploading(true);
        try {
            const res = await videoApi.uploadSceneImage(f);
            setAvatarImagePath(res.path || '');
        } catch {
            alert('Failed to upload avatar image.');
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleNext = () => {
        if (mode === 'text' && text.trim().length < 50) {
            alert('Please enter at least 50 characters.');
            return;
        }
        if (mode === 'file' && !file) {
            alert('Please upload a file.');
            return;
        }
        if (avatarMode !== 'none' && !avatarImagePath) {
            alert('Please upload an avatar image when avatar mode is enabled.');
            return;
        }
        onNext(
            mode === 'text'
                ? { text }
                : { file: file!, fileType: file!.name.split('.').pop() },
        );
    };

    return (
        <div className={styles.stepCard}>
            <div className={styles.stepTitle}>
                <div className={styles.stepIcon}><i className="fas fa-upload" /></div>
                Input Content
            </div>

            <div className={styles.configGrid}>
                {/* Language selector */}
                <div className={styles.langRow}>
                    <label>Video language</label>
                    <select value={lang} onChange={(e) => setLang(e.target.value as 'zh' | 'en')}>
                        <option value="zh">Chinese</option>
                        <option value="en">English</option>
                    </select>
                </div>

                {/* AI Provider selector */}
                <div className={styles.langRow}>
                    <label>AI Provider</label>
                    <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                        <option value="local_ollama">Local Llama (Ollama)</option>
                        <option value="coze">Coze API</option>
                    </select>
                </div>

                {/* Audience selector */}
                <div className={styles.langRow}>
                    <label>Target audience</label>
                    <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                        <option value="student">Student (Undergraduate)</option>
                        <option value="teacher">Teacher (Peer Educators)</option>
                        <option value="researcher">Researcher</option>
                        <option value="general">General Audience</option>
                    </select>
                </div>

                {/* Subtitles toggle */}
                <div className={styles.langRow}>
                    <label className={styles.checkLabel}>
                        <input
                            type="checkbox"
                            checked={enableSubtitles}
                            onChange={(e) => setEnableSubtitles(e.target.checked)}
                        />
                        Burnt-in subtitles (SRT)
                    </label>
                </div>

                {/* Subtitle mode selector */}
                <div className={styles.langRow}>
                    <label>Subtitle mode</label>
                    <select
                        value={enableSubtitles ? subtitleMode : 'none'}
                        onChange={(e) => setSubtitleMode(e.target.value as SubtitleMode)}
                        disabled={!enableSubtitles}
                    >
                        <option value="hard_srt">Hard SRT (FFmpeg burn-in)</option>
                        <option value="image_strip">Image strip subtitles</option>
                        <option value="none">No subtitles</option>
                    </select>
                </div>

                <div className={styles.langRow}>
                    <label>Brand kit</label>
                    <select value={brandKit} onChange={(e) => setBrandKit(e.target.value as BrandKit)}>
                        <option value="none">None</option>
                        <option value="default">Default (intro/outro/thumbnail)</option>
                    </select>
                </div>

                <div className={styles.langRow}>
                    <label>Animation level</label>
                    <select value={animationLevel} onChange={(e) => setAnimationLevel(e.target.value as AnimationLevel)}>
                        <option value="off">Off</option>
                        <option value="basic">Basic</option>
                        <option value="high">High</option>
                    </select>
                </div>

                <div className={styles.langRow}>
                    <label>TTS engine</label>
                    <select value={ttsEngine} onChange={(e) => setTtsEngine(e.target.value as TTSEngine)}>
                        <option value="edge_tts">edge-tts</option>
                        <option value="cosyvoice">CosyVoice</option>
                    </select>
                </div>

                <div className={styles.langRow}>
                    <label>Avatar mode</label>
                    <select value={avatarMode} onChange={(e) => setAvatarMode(e.target.value as AvatarMode)}>
                        <option value="none">None</option>
                        <option value="wav2lip">Wav2Lip</option>
                        <option value="latentsync">LatentSync</option>
                    </select>
                </div>

                {avatarMode !== 'none' && (
                    <div className={`${styles.langRow} ${styles.configSpan2}`}>
                        <label>Avatar image</label>
                        <div className={styles.fileInlineRow}>
                            <input
                                className={styles.fileInput}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleAvatarUpload(f);
                                }}
                            />
                            <span className={styles.inlineStatusText}>
                                {avatarUploading ? 'Uploading...' : (avatarImagePath ? 'Uploaded' : 'Not uploaded')}
                            </span>
                        </div>
                    </div>
                )}

                <div className={`${styles.langRow} ${styles.configSpan2}`}>
                    <label className={styles.checkLabel}>
                        <input
                            type="checkbox"
                            checked={quizEnabled}
                            onChange={(e) => setQuizEnabled(e.target.checked)}
                        />
                        Enable chapters & quiz markers
                    </label>
                </div>

                {/* Max segments slider */}
                <div className={`${styles.langRow} ${styles.configSpan2}`}>
                    <label>Max segments: <strong>{maxSegments}</strong></label>
                    <input
                        className={styles.segmentSlider}
                        type="range"
                        min={3}
                        max={15}
                        value={maxSegments}
                        onChange={(e) => setMaxSegments(Number(e.target.value))}
                    />
                </div>
            </div>

            {/* Mode toggle */}
            <div className={styles.modeToggle}>
                <button className={mode === 'text' ? styles.modeActive : ''} onClick={() => setMode('text')}>
                    <i className="fas fa-keyboard" /> Write / Paste Text
                </button>
                <button className={mode === 'file' ? styles.modeActive : ''} onClick={() => setMode('file')}>
                    <i className="fas fa-upload" /> Upload PDF / MD / TXT
                </button>
            </div>

            {mode === 'text' ? (
                <textarea
                    className={styles.textArea}
                    placeholder="Paste your lecture notes, course content, or any text here..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={12}
                />
            ) : (
                <div className={styles.fileZone} onClick={() => document.getElementById('vg-file-input')?.click()}>
                    <i className="fas fa-cloud-upload-alt" />
                    <p>{file ? file.name : 'Click to select a PDF, .md, or .txt file'}</p>
                    <input
                        id="vg-file-input"
                        type="file"
                        accept=".pdf,.md,.txt"
                        hidden
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                </div>
            )}

            <button className={styles.primaryBtn} onClick={handleNext}>
                Next: Generate Script <i className="fas fa-arrow-right" />
            </button>
        </div>
    );
}
