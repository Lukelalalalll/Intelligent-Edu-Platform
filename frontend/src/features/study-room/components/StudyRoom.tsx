import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import StudyCoach from './StudyCoach';
import NotesPanel from './NotesPanel';
import client from '@/shared/api/client';
import styles from '../styles/StudyRoom.module.css';

const PdfViewer = lazy(() => import('./PdfViewer'));

export default function StudyRoom() {
    const [file, setFile] = useState<File | null>(null);
    const [fileType, setFileType] = useState<'pdf' | 'md' | null>(null);
    const [pendingHighlight, setPendingHighlight] = useState<string | { text?: string; mode?: string } | null>(null);
    const [notes, setNotes] = useState<any[]>([]);
    const [pdfText, setPdfText] = useState('');

    const storageKey = file ? `study_notes_${file.name}_${file.size}` : null;
    const notesLoadedRef = useRef(false);

    useEffect(() => {
        notesLoadedRef.current = false;
        if (!storageKey) {
            setNotes([]);
            return;
        }

        let localNotes: any[] = [];
        try {
            const saved = localStorage.getItem(storageKey);
            localNotes = saved ? JSON.parse(saved) : [];
        } catch {
            localNotes = [];
        }

        setNotes(localNotes);
        notesLoadedRef.current = true;

        client.get('/study-notes/room-notes', { params: { source_doc: storageKey } })
            .then((response) => {
                const cloudNotes: any[] = (response.data || []).map((note: any) => ({
                    id: note.note_id,
                    content: note.content,
                    color: note.color || 'yellow',
                    highlightedText: note.highlighted_text || null,
                    pageNumber: note.page_number || null,
                    createdAt: note.created_at || new Date().toISOString(),
                }));

                if (cloudNotes.length === 0) {
                    return;
                }

                setNotes((prev) => {
                    const mergedMap = new Map(prev.map((note) => [note.id, note]));
                    cloudNotes.forEach((note) => mergedMap.set(note.id, note));
                    return [...mergedMap.values()].sort(
                        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
                    );
                });
            })
            .catch(() => {});
    }, [storageKey]);

    useEffect(() => {
        if (!storageKey || !notesLoadedRef.current) {
            return;
        }

        localStorage.setItem(storageKey, JSON.stringify(notes));
    }, [notes, storageKey]);

    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>, type: 'pdf' | 'md') => {
        const selectedFile = event.target.files?.[0];
        if (!selectedFile) {
            return;
        }

        setFile(selectedFile);
        setFileType(type);
        setPendingHighlight(null);
    }, []);

    const handleClose = useCallback(() => {
        setFile(null);
        setFileType(null);
        setPendingHighlight(null);
        setPdfText('');
    }, []);

    const handleHighlight = useCallback((text: string, mode: string) => {
        setPendingHighlight({ text, mode: mode || 'explain' });
    }, []);

    const handleDismissHighlight = useCallback(() => {
        setPendingHighlight(null);
    }, []);

    const handleAddNote = useCallback(({
        content,
        color,
        highlightedText,
    }: {
        content: string;
        color: string;
        highlightedText?: string;
    }) => {
        const note = {
            id: `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
            content,
            color: color || 'yellow',
            highlightedText: highlightedText || null,
            pageNumber: null,
            createdAt: new Date().toISOString(),
        };

        setNotes((prev) => [note, ...prev]);

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
        setNotes((prev) => prev.filter((note) => note.id !== id));
        client.delete(`/study-notes/room-notes/${id}`).catch(() => {});
    }, []);

    const handleSaveCoachNote = useCallback((content: string) => {
        const highlightedText = pendingHighlight && typeof pendingHighlight === 'object'
            ? pendingHighlight.text
            : typeof pendingHighlight === 'string'
                ? pendingHighlight
                : undefined;
        handleAddNote({ content, color: 'blue', highlightedText });
    }, [handleAddNote, pendingHighlight]);

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
                    <input
                        id="sr-pdf-input"
                        type="file"
                        accept=".pdf"
                        style={{ display: 'none' }}
                        onChange={(event) => handleFileSelect(event, 'pdf')}
                    />
                    <input
                        id="sr-md-input"
                        type="file"
                        accept=".md,.markdown,.txt"
                        style={{ display: 'none' }}
                        onChange={(event) => handleFileSelect(event, 'md')}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={styles.studyRoomWrapper}>
            <div className={styles.splitLayout}>
                <div className={styles.leftPanel}>
                    <Suspense fallback={<div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#888' }}>Loading viewer...</div>}>
                        <PdfViewer
                            file={file}
                            fileType={fileType ?? undefined}
                            onHighlight={handleHighlight}
                            onClose={handleClose}
                            onAddNote={handleAddNote}
                            onTextExtracted={setPdfText}
                        />
                    </Suspense>
                    <NotesPanel
                        notes={notes}
                        onAdd={handleAddNote}
                        onDelete={handleDeleteNote}
                        onClickNote={undefined}
                    />
                </div>

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
