import React from 'react';
import type { EditorSession } from '../../../api/slidesApi';
import type { EditorState } from '../hooks/useEditorSession';
import { resolveApiRoot } from '@/shared/api/root';
import styles from '../styles/SlideEditor.module.css';

const API_ROOT = resolveApiRoot();

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
                        decoding="async"
                    />
                    <span className={styles.thumbLabel}>{idx + 1}</span>
                </div>
            ))}
        </div>
    );
}
