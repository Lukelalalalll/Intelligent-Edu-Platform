import React, { useRef, useState, useCallback } from 'react';
import styles from '../styles/docManager.module.css';

interface UploadZoneProps {
    courseId: string;
    onUpload: (file: File) => void;
    disabled?: boolean;
}

const ACCEPTED = '.pdf,.txt,.md,.markdown';

export default function UploadZone({ courseId, onUpload, disabled }: UploadZoneProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    const handleFiles = useCallback((files: FileList | null) => {
        if (!files) return;
        Array.from(files).forEach(f => onUpload(f));
    }, [onUpload]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
    }, [disabled, handleFiles]);

    return (
        <div
            className={`${styles['upload-zone']} ${dragOver ? styles['upload-zone-drag'] : ''} ${disabled ? styles['upload-zone-disabled'] : ''}`}
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
        >
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                style={{ display: 'none' }}
                onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ''; }}
                disabled={disabled}
            />
            <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: '#0d9488', marginBottom: 8 }} />
            <p className={styles['upload-text']}>
                Drag &amp; drop PDF, TXT, or Markdown files here
            </p>
            <p className={styles['upload-hint']}>or click to browse · max 20 MB per file</p>
        </div>
    );
}
