import React from 'react';
import type { EditorElement } from '../../../api/slidesApi';
import styles from '../styles/SlideEditor.module.css';

interface Props {
    element: EditorElement | null;
}

export default function PropertiesPanel({ element }: Props) {
    return (
        <div className={styles.propsPanel}>
            <div className={styles.propsTitle}>Properties</div>

            {!element ? (
                <div className={styles.emptyProps}>Click a slide element to view its properties</div>
            ) : (
                <>
                    <div className={styles.propsRow}>
                        <span>Type</span>
                        <span className={styles.propsValue}>{element.type === 'text' ? 'Text' : 'Image'}</span>
                    </div>
                    <div className={styles.propsRow}>
                        <span>ID</span>
                        <span className={styles.propsValue}>{element.id}</span>
                    </div>
                    {element.type === 'text' && (
                        <>
                            {element.font_size != null && (
                                <div className={styles.propsRow}>
                                    <span>Font Size</span>
                                    <span className={styles.propsValue}>{element.font_size}pt</span>
                                </div>
                            )}
                            <div className={styles.propsRow}>
                                <span>Bold</span>
                                <span className={styles.propsValue}>{element.bold ? 'Yes' : 'No'}</span>
                            </div>
                            <div className={styles.propsRow}>
                                <span>Align</span>
                                <span className={styles.propsValue}>{element.align || 'left'}</span>
                            </div>
                        </>
                    )}
                    <div className={styles.propsRow}>
                        <span>Position</span>
                        <span className={styles.propsValue}>
                            ({element.bbox.x.toFixed(0)}, {element.bbox.y.toFixed(0)})
                        </span>
                    </div>
                    <div className={styles.propsRow}>
                        <span>Size</span>
                        <span className={styles.propsValue}>
                            {element.bbox.w.toFixed(0)} × {element.bbox.h.toFixed(0)}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
