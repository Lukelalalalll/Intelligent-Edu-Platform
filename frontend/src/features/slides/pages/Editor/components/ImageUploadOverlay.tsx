import React, { useRef } from 'react';
import type { EditorElement, EditorBbox } from '../../../api/slidesApi';
import styles from '../styles/SlideEditor.module.css';

interface Props {
    element: EditorElement;
    bbox: EditorBbox;
    currentAssetUrl: string | null;
    isSelected: boolean;
    onSelect: () => void;
    onUpload: (file: File) => void;
}

export default function ImageUploadOverlay({ element, bbox, currentAssetUrl, isSelected, onSelect, onUpload }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div
            className={`${styles.overlay} ${styles.imgOverlay} ${isSelected ? styles.overlayActive : ''}`}
            style={{
                left: bbox.x,
                top: bbox.y,
                width: bbox.w,
                height: bbox.h,
                zIndex: 10,
            }}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
                inputRef.current?.click();
            }}
        >
            {currentAssetUrl ? (
                <img src={currentAssetUrl} className={styles.imgPreview} alt="Uploaded" draggable={false} />
            ) : (
                <div className={styles.imgPlaceholder}>
                    <i className="fas fa-image" style={{ fontSize: 22 }} />
                    <span>点击上传</span>
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUpload(file);
                    e.target.value = '';
                }}
            />
        </div>
    );
}
