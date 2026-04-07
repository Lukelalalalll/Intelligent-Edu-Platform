import React, { useState, useCallback, useEffect, useRef } from 'react';
import PdfViewer from './components/PdfViewer';
import StudyCoach from './components/StudyCoach';
import NotesPanel from './components/NotesPanel';
import styles from './styles/StudyRoom.module.css';

export default function StudyRoom() {
    const [file, setFile] = useState(null);
    const [fileType, setFileType] = useState(null); // 'pdf' | 'md'
    const [pendingHighlight, setPendingHighlight] = useState(null);
    const [notes, setNotes] = useState([]);
    const [pdfText, setPdfText] = useState('');

    // Load notes from localStorage — use ref to prevent save-before-load race
    const storageKey = file ? `study_notes_${file.name}_${file.size}` : null;
    const notesLoadedRef = useRef(false);

    useEffect(() => {
        notesLoadedRef.current = false;
        if (!storageKey) { setNotes([]); return; }
        try {
            const saved = localStorage.getItem(storageKey);
            setNotes(saved ? JSON.parse(saved) : []);
        } catch { setNotes([]); }
        notesLoadedRef.current = true;
    }, [storageKey]);

    // Persist notes — only after initial load completes
    useEffect(() => {
        if (!storageKey || !notesLoadedRef.current) return;
        localStorage.setItem(storageKey, JSON.stringify(notes));
    }, [notes, storageKey]);

    const handleFileSelect = (e, type) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setFileType(type);
        setPendingHighlight(null);
    };

    const handleClose = () => {
        setFile(null);
        setFileType(null);
        setPendingHighlight(null);
        setPdfText('');
    };

    const handleHighlight = useCallback((text, mode) => {
        setPendingHighlight({ text, mode: mode || 'explain' });
    }, []);

    const handleDismissHighlight = useCallback(() => {
        setPendingHighlight(null);
    }, []);

    const handleAddNote = useCallback(({ content, color, highlightedText }) => {
        const note = {
            id: 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            content,
            color: color || 'yellow',
            highlightedText: highlightedText || null,
            pageNumber: null,
            createdAt: new Date().toISOString(),
        };
        setNotes(prev => [note, ...prev]);
    }, []);

    const handleDeleteNote = useCallback((id) => {
        setNotes(prev => prev.filter(n => n.id !== id));
    }, []);

    const handleSaveCoachNote = useCallback((content) => {
        const hlText = pendingHighlight?.text || (typeof pendingHighlight === 'string' ? pendingHighlight : null);
        handleAddNote({ content, color: 'blue', highlightedText: hlText });
    }, [handleAddNote, pendingHighlight]);

    // Upload zone (no file loaded yet)
    if (!file) {
        return (
            <div className={styles.studyRoomWrapper}>
                <div className={styles.uploadZone}>
                    <div className={styles.uploadIcon}>
                        <i className="fas fa-book-open"></i>
                    </div>
                    <div className={styles.uploadTitle}>Upload your study material</div>
                    <div className={styles.uploadHint}>
                        Upload a PDF or Markdown file to start reading, highlighting, and getting AI-powered study help.
                    </div>
                    <div className={styles.uploadBtns}>
                        <button className={styles.uploadBtn} onClick={() => document.getElementById('sr-pdf-input').click()}>
                            <i className="fas fa-file-pdf"></i> Upload PDF
                        </button>
                        <button className={styles.uploadBtn} onClick={() => document.getElementById('sr-md-input').click()}>
                            <i className="fas fa-file-alt"></i> Upload MD
                        </button>
                    </div>
                    <input id="sr-pdf-input" type="file" accept=".pdf" style={{ display: 'none' }}
                        onChange={(e) => handleFileSelect(e, 'pdf')} />
                    <input id="sr-md-input" type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }}
                        onChange={(e) => handleFileSelect(e, 'md')} />
                </div>
            </div>
        );
    }

    // Split layout: viewer + coach
    return (
        <div className={styles.studyRoomWrapper}>
            <div className={styles.splitLayout}>
                {/* Left: Document Viewer + Notes */}
                <div className={styles.leftPanel}>
                    <PdfViewer
                        file={file}
                        fileType={fileType}
                        onHighlight={handleHighlight}
                        onClose={handleClose}
                        onAddNote={handleAddNote}
                        onTextExtracted={setPdfText}
                    />
                    <NotesPanel
                        notes={notes}
                        onAdd={handleAddNote}
                        onDelete={handleDeleteNote}
                        onClickNote={null}
                    />
                </div>

                {/* Right: AI Study Coach */}
                <div className={styles.rightPanel}>
                    <StudyCoach
                        pendingHighlight={pendingHighlight}
                        onDismissHighlight={handleDismissHighlight}
                        onSaveNote={handleSaveCoachNote}
                        pdfText={pdfText}
                    />
                </div>
            </div>
        </div>
    );
}
