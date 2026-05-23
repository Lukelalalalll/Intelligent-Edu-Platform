import React, { useState, useCallback, useEffect, useRef } from 'react';
import PdfViewer from './PdfViewer';
import StudyCoach from './StudyCoach';
import NotesPanel from './NotesPanel';
import client from '@/shared/api/client';
import styles from '../styles/StudyRoom.module.css';

export default function StudyRoom() {
    const [file, setFile] = useState<File | null>(null);
    const [fileType, setFileType] = useState<'pdf' | 'md' | null>(null); // 'pdf' | 'md'
    const [pendingHighlight, setPendingHighlight] = useState<string | { text?: string; mode?: string } | null>(null);
    const [notes, setNotes] = useState<any[]>([]);
    const [pdfText, setPdfText] = useState('');

    // Load notes from localStorage — use ref to prevent save-before-load race
    const storageKey = file ? `study_notes_${file.name}_${file.size}` : null;
    const notesLoadedRef = useRef(false);

    useEffect(() => {
        notesLoadedRef.current = false;
        if (!storageKey) { setNotes([]); return; }

        // 1. Load from localStorage immediately for instant render
        let localNotes: any[] = [];
        try {
            const saved = localStorage.getItem(storageKey);
            localNotes = saved ? JSON.parse(saved) : [];
        } catch { /* ignore */ }
        setNotes(localNotes);
        notesLoadedRef.current = true;

        // 2. Fetch cloud notes and merge (cloud wins by note_id)
        client.get('/study-notes/room-notes', { params: { source_doc: storageKey } })
            .then(res => {
                const cloudNotes: any[] = (res.data || []).map((n: any) => ({
                    id: n.note_id,
                    content: n.content,
                    color: n.color || 'yellow',
                    highlightedText: n.highlighted_text || null,
                    pageNumber: n.page_number || null,
                    createdAt: n.created_at || new Date().toISOString(),
                }));
                if (cloudNotes.length === 0) return;
                setNotes(prev => {
                    const mergedMap = new Map(prev.map(n => [n.id, n]));
                    cloudNotes.forEach(n => mergedMap.set(n.id, n));
                    return [...mergedMap.values()].sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                });
            })
            .catch(() => { /* cloud unavailable — local notes are fine */ });
    }, [storageKey]);

    // Persist notes — only after initial load completes
    useEffect(() => {
        if (!storageKey || !notesLoadedRef.current) return;
        localStorage.setItem(storageKey, JSON.stringify(notes));
    }, [notes, storageKey]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'pdf' | 'md') => {
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

    const handleHighlight = useCallback((text: string, mode: string) => {
        setPendingHighlight({ text, mode: mode || 'explain' });
    }, []);

    const handleDismissHighlight = useCallback(() => {
        setPendingHighlight(null);
    }, []);

    const handleAddNote = useCallback(({ content, color, highlightedText }: { content: string; color: string; highlightedText?: string }) => {
        const note = {
            id: 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            content,
            color: color || 'yellow',
            highlightedText: highlightedText || null,
            pageNumber: null,
            createdAt: new Date().toISOString(),
        };
        setNotes(prev => [note, ...prev]);
        // Fire-and-forget cloud sync
        if (storageKey) {
            client.post('/study-notes/room-notes', {
                note_id: note.id,
                content: note.content,
                color: note.color,
                highlighted_text: note.highlightedText,
                source_doc: storageKey,
                page_number: note.pageNumber,
            }).catch(() => {});
        }
    }, [storageKey]);

    const handleDeleteNote = useCallback((id: string | number) => {
        setNotes(prev => prev.filter(n => n.id !== id));
        // Fire-and-forget cloud delete
        client.delete(`/study-notes/room-notes/${id}`).catch(() => {});
    }, []);

    const handleSaveCoachNote = useCallback((content: string) => {
        const hlText = pendingHighlight && typeof pendingHighlight === 'object'
            ? pendingHighlight.text
            : typeof pendingHighlight === 'string'
                ? pendingHighlight
                : undefined;
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
                        <button className={styles.uploadBtn} onClick={() => document.getElementById('sr-pdf-input')?.click()}>
                            <i className="fas fa-file-pdf"></i> Upload PDF
                        </button>
                        <button className={styles.uploadBtn} onClick={() => document.getElementById('sr-md-input')?.click()}>
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
                        fileType={fileType ?? undefined}
                        onHighlight={handleHighlight}
                        onClose={handleClose}
                        onAddNote={handleAddNote}
                        onTextExtracted={setPdfText}
                    />
                    <NotesPanel
                        notes={notes}
                        onAdd={handleAddNote}
                        onDelete={handleDeleteNote}
                        onClickNote={undefined}
                    />
                </div>

                {/* Right: AI Study Coach */}
                <div className={styles.rightPanel}>
                    <StudyCoach
                        pendingHighlight={pendingHighlight ?? undefined}
                        onDismissHighlight={handleDismissHighlight}
                        onSaveNote={handleSaveCoachNote}
                        pdfText={pdfText}
                        storageKey={storageKey ?? undefined}
                    />
                </div>
            </div>
        </div>
    );
}
