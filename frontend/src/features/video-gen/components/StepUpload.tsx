import { useState } from 'react';
import styles from '../styles/videoGen.module.css';
import type { AIProvider, Audience } from '../components/VideoGenView';

interface Props {
    lang: 'zh' | 'en';
    setLang: (l: 'zh' | 'en') => void;
    provider: AIProvider;
    setProvider: (p: AIProvider) => void;
    audience: Audience;
    setAudience: (a: Audience) => void;
    enableSubtitles: boolean;
    setEnableSubtitles: (v: boolean) => void;
    maxSegments: number;
    setMaxSegments: (n: number) => void;
    onNext: (data: { text?: string; file?: File; fileType?: string }) => void;
}

export default function StepUpload({ lang, setLang, provider, setProvider, audience, setAudience, enableSubtitles, setEnableSubtitles, maxSegments, setMaxSegments, onNext }: Props) {
    const [mode, setMode] = useState<'text' | 'file'>('text');
    const [text, setText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleNext = () => {
        if (mode === 'text' && text.trim().length < 50) {
            alert('Please enter at least 50 characters.');
            return;
        }
        if (mode === 'file' && !file) {
            alert('Please upload a file.');
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

            {/* Language selector */}
            <div className={styles.langRow}>
                <label>Video language:</label>
                <select value={lang} onChange={(e) => setLang(e.target.value as 'zh' | 'en')}>
                    <option value="zh">Chinese</option>
                    <option value="en">English</option>
                </select>
            </div>

            {/* AI Provider selector */}
            <div className={styles.langRow}>
                <label>AI Provider:</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value as AIProvider)}>
                    <option value="local_ollama">Local Llama (Ollama)</option>
                    <option value="coze">Coze API</option>
                </select>
            </div>

            {/* Audience selector */}
            <div className={styles.langRow}>
                <label>Target audience:</label>
                <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                    <option value="student">Student (Undergraduate)</option>
                    <option value="teacher">Teacher (Peer Educators)</option>
                    <option value="researcher">Researcher</option>
                    <option value="general">General Audience</option>
                </select>
            </div>

            {/* Subtitles toggle */}
            <div className={styles.langRow}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={enableSubtitles}
                        onChange={(e) => setEnableSubtitles(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    Burnt-in subtitles (SRT)
                </label>
            </div>

            {/* Max segments slider */}
            <div className={styles.langRow}>
                <label>Max segments: <strong>{maxSegments}</strong></label>
                <input
                    type="range"
                    min={3}
                    max={15}
                    value={maxSegments}
                    onChange={(e) => setMaxSegments(Number(e.target.value))}
                    style={{ width: 160, cursor: 'pointer' }}
                />
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
