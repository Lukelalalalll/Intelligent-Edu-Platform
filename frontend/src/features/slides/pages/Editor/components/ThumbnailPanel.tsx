import React from 'react';
import type { EditorSession } from '../../../api/slidesApi';
import type { EditorState } from '../hooks/useEditorSession';
import styles from '../styles/SlideEditor.module.css';

const API_ROOT = import.meta.env.VITE_API_ROOT || 'http://localhost:5009';

interface Props {
    slides: EditorSession['slides'] | undefined;
    activeIndex: number;
    onSelect: (idx: number) => void;
}

export default function ThumbnailPanel({ slides, activeIndex, onSelect }: Props) {
    if (!slides?.length) return null;

    return (
        <div className={styles.thumbnailPanel}>
            {slides.map((slide, idx) => (
                <div
                    key={idx}
                    className={`${styles.thumbItem} ${idx === activeIndex ? styles.thumbItemActive : ''}`}
                    onClick={() => onSelect(idx)}
                >
                    <img
                        className={styles.thumbImg}
                        src={`${API_ROOT}${slide.preview_url}`}
                        alt={`Slide ${idx + 1}`}
                        loading="lazy"
                    />
                    <span className={styles.thumbLabel}>{idx + 1}</span>
                </div>
            ))}
        </div>
    );
}
