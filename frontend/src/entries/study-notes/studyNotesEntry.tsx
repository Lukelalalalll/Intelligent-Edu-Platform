import React, { useState, useRef, useCallback } from 'react';
import client from '../../api/client';
import StudyNotes from '../../features/study-notes/StudyNotes';
import styles from '../../features/study-notes/styles/sub5.module.css';

export default function StudyNotesEntry() {
    const fileInputRef = useRef(null);

    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [style, setStyle] = useState('detailed');
    const [notes, setNotes] = useState('');
    const [flashcards, setFlashcards] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('notes');

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') setFile(f);
    };
    const handleFileInput = (e) => {
        const f = e.target.files[0];
        if (f) setFile(f);
        e.target.value = '';
    };

    const handleGenerate = useCallback(async () => {
        if (!file) return;
        setIsLoading(true);
        setLoadingText('Extracting text and generating study notes...');
        setError('');

        try {
            // Generate notes
            const formData = new FormData();
            formData.append('file', file);
            formData.append('style', style);
            const notesRes = await client.post('/study-notes/generate-notes', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (notesRes.data.success) {
                setNotes(notesRes.data.notes);
                setActiveTab('notes');
            }

            // Generate flashcards
            setLoadingText('Generating flashcards...');
            const flashForm = new FormData();
            flashForm.append('file', file);
            const flashRes = await client.post('/study-notes/generate-flashcards', flashForm, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (flashRes.data.success && flashRes.data.flashcards?.length > 0) {
                setFlashcards(flashRes.data.flashcards);
            }
        } catch (err) {
            const detail = err?.response?.data?.detail;
            setError(typeof detail === 'string' ? detail : 'Failed to generate notes');
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    }, [file, style]);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1><i className="fas fa-book-reader"></i> AI Study Notes Generator</h1>
                <p className={styles.subtitle}>Upload lecture PDFs to generate structured notes and flashcards</p>
            </header>

            {/* Upload */}
            <div className={styles.uploadCard}>
                <div
                    className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <i className="fas fa-cloud-upload-alt"></i>
                    <p>{file ? '' : 'Drag & drop your lecture PDF here, or click to browse'}</p>
                    {file && <p className={styles.fileName}>{file.name}</p>}
                    <input type="file" accept=".pdf" className={styles.fileInput} ref={fileInputRef} onChange={handleFileInput} />
                </div>

                <div className={styles.controls}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-sub)' }}>Style:</span>
                    {['detailed', 'concise', 'exam'].map((s) => (
                        <button
                            key={s}
                            className={`${styles.styleBtn} ${style === s ? styles.styleBtnActive : ''}`}
                            onClick={() => setStyle(s)}
                        >
                            {s === 'detailed' ? 'Detailed' : s === 'concise' ? 'Concise' : 'Exam Prep'}
                        </button>
                    ))}
                    <button
                        className={styles.generateBtn}
                        onClick={handleGenerate}
                        disabled={!file || isLoading}
                    >
                        {isLoading
                            ? <><i className="fas fa-spinner fa-spin"></i> Generating...</>
                            : <><i className="fas fa-magic"></i> Generate</>
                        }
                    </button>
                </div>

                {error && (
                    <p className={styles.errorText}>{error}</p>
                )}
            </div>

            {/* Results */}
            <StudyNotes
                notes={notes}
                flashcards={flashcards}
                isLoading={isLoading}
                loadingText={loadingText}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
            />
        </div>
    );
}
