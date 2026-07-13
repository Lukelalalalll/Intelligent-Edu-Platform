import React, { useRef, useEffect, useState } from 'react';
import type { EditorElement, EditorBbox } from '../../../api/slidesApi';
import styles from '../styles/SlideEditor.module.css';

interface Props {
    element: EditorElement;
    bbox: EditorBbox;
    currentContent: string;
    isSelected: boolean;
    scale: number;
    onSelect: () => void;
    onChange: (text: string) => void;
    onSave?: () => void;
    isSaving?: boolean;
}

export default function EditableTextOverlay({
    element, bbox, currentContent, isSelected, scale, onSelect, onChange,
    onSave, isSaving,
}: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState(false);

    const fontSize = element.font_size ? element.font_size * scale : 14 * scale;
    const isEdited = currentContent !== (element.content ?? '');
    const fontColor = element.font_color || '#111111';

    // Show the editing card only while the user is actively editing (focused or just blurred with changes)
    const showEditCard = editing && !isSaving;

    // Sync DOM content when currentContent changes externally (e.g., after save re-render)
    useEffect(() => {
        if (ref.current && document.activeElement !== ref.current) {
            ref.current.innerText = currentContent;
        }
    }, [currentContent]);

    // When save completes, close the editing card
    useEffect(() => {
        if (!isEdited && !isSaving) {
            setEditing(false);
        }
    }, [isEdited, isSaving]);

    const handleFocus = () => {
        setEditing(true);
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        const text = (e.target as HTMLElement).innerText;
        if (text !== currentContent) onChange(text);
        // If no changes were made, close the card immediately
        if (text === currentContent) {
            setEditing(false);
        }
        // Otherwise keep card open so user can click Save
    };

    const handleSaveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditing(false);
        if (onSave) onSave();
    };

    return (
        <div
            className={`${styles.overlay} ${showEditCard ? styles.overlayEditing : ''}`}
            style={{
                '--text-color': fontColor,
                left: bbox.x,
                top: bbox.y,
                width: bbox.w,
                height: showEditCard ? 'auto' : bbox.h,
                minHeight: bbox.h,
                cursor: 'text',
                zIndex: showEditCard ? 20 : 10,
            } as React.CSSProperties}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            <div
                ref={ref}
                contentEditable={!isSaving}
                suppressContentEditableWarning
                className={`${styles.editableContent} ${isEdited ? styles.editableContentEdited : ''} ${showEditCard ? styles.editableContentVisible : ''}`}
                style={{
                    fontSize: `${fontSize}px`,
                    fontWeight: element.bold ? 'bold' : 'normal',
                    textAlign: (element.align as any) ?? 'left',
                    minHeight: bbox.h,
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
            >
                {currentContent}
            </div>
            {/* Save bar — visible when editing card is shown and content has changed */}
            {showEditCard && isEdited && (
                <div className={styles.editSaveBar}>
                    <span className={styles.editSaveHint}>
                        <i className="fas fa-pencil-alt" style={{ fontSize: '10px', marginRight: '4px' }} />
                        Modified
                    </span>
                    <button
                        type="button"
                        className={styles.editSaveBtn}
                        disabled={isSaving}
                        onClick={handleSaveClick}
                    >
                        {isSaving ? (
                            <><span className={styles.editSaveSpinner} />Saving...</>
                        ) : (
                            <><i className="fas fa-save" style={{ marginRight: '4px' }} />Save</>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
