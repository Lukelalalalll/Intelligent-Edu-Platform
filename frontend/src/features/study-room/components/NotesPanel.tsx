import React, { useState } from 'react';
import styles from '../styles/StudyRoom.module.css';

const COLORS = [
    { key: 'yellow', bg: 'rgba(255, 235, 59, 0.2)', bar: '#FDD835' },
    { key: 'blue', bg: 'rgba(66, 165, 245, 0.15)', bar: '#42A5F5' },
    { key: 'pink', bg: 'rgba(236, 64, 122, 0.15)', bar: '#EC407A' },
];

interface NoteItem {
    id: string | number;
    content?: string;
    color?: string;
    highlightedText?: string;
    pageNumber?: number;
    createdAt?: string | number;
}

interface NotesPanelProps {
    notes: NoteItem[];
    onAdd?: (note: { content: string; color: string; highlightedText?: string }) => void;
    onDelete?: (id: string | number) => void;
    onClickNote?: (note: NoteItem) => void;
}

export default function NotesPanel({ notes, onAdd, onDelete, onClickNote }: NotesPanelProps) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [color, setColor] = useState('yellow');

    const handleAdd = () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        onAdd?.({ content: trimmed, color });
        setText('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <>
            <button
                type="button"
                className={styles.notesToggle}
                onClick={() => setOpen(v => !v)}
            >
                <div className={styles.notesToggleLeft}>
                    <i className="fas fa-sticky-note"></i>
                    <span>My Notes</span>
                    {notes.length > 0 && <span className={styles.notesBadge}>{notes.length}</span>}
                </div>
                <i className={`fas fa-chevron-down ${styles.notesChevron} ${open ? styles.notesChevronOpen : ''}`}></i>
            </button>

            <div className={`${styles.notesBody} ${open ? styles.notesBodyOpen : ''}`}>
                <div className={styles.notesInputRow}>
                    <input
                        className={styles.notesInput}
                        placeholder="Add a note..."
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <div className={styles.colorDots}>
                        {COLORS.map(c => (
                            <button
                                key={c.key}
                                className={`${styles.colorDot} ${color === c.key ? styles.colorDotActive : ''}`}
                                style={{ backgroundColor: c.bar }}
                                onClick={(e) => { e.stopPropagation(); setColor(c.key); }}
                                title={c.key}
                            />
                        ))}
                    </div>
                    <button className={styles.addNoteBtn} onClick={handleAdd}>
                        <i className="fas fa-plus"></i>
                    </button>
                </div>

                {notes.length === 0 ? (
                    <div className={styles.emptyNotes}>
                        <i className="fas fa-pen-nib"></i> No notes yet. Start typing above.
                    </div>
                ) : (
                    <div className={styles.notesList}>
                        {notes.map(note => {
                            const colorObj = COLORS.find(c => c.key === note.color) || COLORS[0];
                            return (
                                // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- can't use <button>: contains nested delete <button>
                                <div
                                    key={note.id}
                                    className={styles.noteItem}
                                    style={{ background: colorObj.bg }}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onClickNote?.(note)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickNote?.(note); } }}
                                >
                                    <div className={styles.noteColorBar} style={{ background: colorObj.bar }} />
                                    <div className={styles.noteContent}>
                                        <div className={styles.noteText}>{note.content}</div>
                                        {note.highlightedText && (
                                            <div className={styles.noteHighlightRef}>
                                                📌 "{note.highlightedText.length > 60
                                                    ? note.highlightedText.slice(0, 60) + '...'
                                                    : note.highlightedText}"
                                            </div>
                                        )}
                                        <div className={styles.noteMeta}>
                                            <span>Page {note.pageNumber || '—'}</span>
                                            <span>·</span>
                                            <span>{new Date(note.createdAt ?? Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <button
                                                className={styles.noteDeleteBtn}
                                                onClick={(e) => { e.stopPropagation(); onDelete?.(note.id); }}
                                            >
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}


