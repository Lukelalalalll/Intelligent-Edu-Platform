import React from 'react';
import type { WorkbenchAnnotation } from '../types/workbench';

interface LabelEditorProps {
    annotation: WorkbenchAnnotation;
    saving?: boolean;
    localError?: string;
    onChangeAnnotation: (fn: (prev: WorkbenchAnnotation) => WorkbenchAnnotation) => void;
    onSave: () => void;
    onDelete: () => void;
    onClose: () => void;
}

export default function LabelEditor({ annotation, saving, localError, onChangeAnnotation, onSave, onDelete, onClose }: LabelEditorProps) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 12,
                right: 12,
                width: 320,
                maxWidth: 'calc(100% - 24px)',
                border: '1px solid #d1d5db',
                borderRadius: 10,
                padding: 12,
                background: 'rgba(248, 250, 252, 0.96)',
                display: 'grid',
                gap: 8,
                backdropFilter: 'blur(4px)',
                zIndex: 20,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 14 }}>Label Editor</strong>
                <span style={{ fontSize: 12, color: '#64748b' }}>Page {annotation.pageNumber}</span>
            </div>
            <input
                placeholder="Label title (optional)"
                value={annotation.title || ''}
                onChange={(e) => onChangeAnnotation((prev) => ({ ...prev, title: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff' }}
            />
            <textarea
                placeholder="Write teacher feedback here..."
                value={annotation.comment || ''}
                rows={4}
                onChange={(e) => onChangeAnnotation((prev) => ({ ...prev, comment: e.target.value }))}
                style={{ padding: 10, borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical', background: '#fff' }}
            />
            {localError && <div style={{ color: '#b91c1c', fontSize: 12 }}>{localError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', color: '#334155', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
                >
                    Close
                </button>
                {annotation.id && (
                    <button type="button" onClick={onDelete} style={{ padding: '8px 12px', border: '1px solid #ef4444', color: '#b91c1c', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                        Delete
                    </button>
                )}
                <button type="button" onClick={onSave} disabled={saving} style={{ padding: '8px 12px', border: 'none', color: '#fff', background: '#0f766e', borderRadius: 6, cursor: 'pointer' }}>
                    {saving ? 'Saving...' : 'Save Label'}
                </button>
            </div>
        </div>
    );
}
