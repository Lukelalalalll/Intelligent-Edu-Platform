import React from 'react';
import type { EditorElement } from '../../../api/slidesApi';
import styles from '../styles/SlideEditor.module.css';

interface Props {
    element: EditorElement | null;
}

export default function PropertiesPanel({ element }: Props) {
    return (
        <div className={styles.propsPanel}>
            <div className={styles.propsTitle}>属性</div>

            {!element ? (
                <div className={styles.emptyProps}>点击幻灯片元素查看属性</div>
            ) : (
                <>
                    <div className={styles.propsRow}>
                        <span>类型</span>
                        <span className={styles.propsValue}>{element.type === 'text' ? '文字' : '图片'}</span>
                    </div>
                    <div className={styles.propsRow}>
                        <span>ID</span>
                        <span className={styles.propsValue}>{element.id}</span>
                    </div>
                    {element.type === 'text' && (
                        <>
                            {element.font_size != null && (
                                <div className={styles.propsRow}>
                                    <span>字号</span>
                                    <span className={styles.propsValue}>{element.font_size}pt</span>
                                </div>
                            )}
                            <div className={styles.propsRow}>
                                <span>加粗</span>
                                <span className={styles.propsValue}>{element.bold ? '是' : '否'}</span>
                            </div>
                            <div className={styles.propsRow}>
                                <span>对齐</span>
                                <span className={styles.propsValue}>{element.align || 'left'}</span>
                            </div>
                        </>
                    )}
                    <div className={styles.propsRow}>
                        <span>位置</span>
                        <span className={styles.propsValue}>
                            ({element.bbox.x.toFixed(0)}, {element.bbox.y.toFixed(0)})
                        </span>
                    </div>
                    <div className={styles.propsRow}>
                        <span>尺寸</span>
                        <span className={styles.propsValue}>
                            {element.bbox.w.toFixed(0)} × {element.bbox.h.toFixed(0)}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}
