import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { slidesEditorApi } from '../../api/slidesApi';
import { resolveApiRoot } from '@/shared/api/root';
import { useEditorSession } from './hooks/useEditorSession';
import SlideEditorView from './SlideEditorView';

export default function SlideEditorPage() {
    const navigate = useNavigate();
    const { session, loading, error, editorState, dispatch, buildEdits, canUndo, canRedo, undo, redo } = useEditorSession();
    const [activeSlide, setActiveSlide] = useState(0);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const API_ROOT = resolveApiRoot();

    const handleTextChange = useCallback((id: string, text: string) => {
        dispatch({ type: 'EDIT_TEXT', slideIdx: activeSlide, id, content: text });
    }, [dispatch, activeSlide]);

    const handleImageUpload = useCallback(async (id: string, file: File) => {
        try {
            const { asset_id, url } = await slidesEditorApi.uploadImage(file);
            dispatch({
                type: 'UPLOAD_IMAGE',
                slideIdx: activeSlide,
                id,
                asset_url: `${API_ROOT}${url}`,
                asset_id,
            });
            toast.success('Image uploaded');
        } catch {
            toast.error('Image upload failed');
        }
    }, [dispatch, activeSlide, API_ROOT]);

    const handleExport = useCallback(async () => {
        if (!session) return;
        setExporting(true);
        const toastId = toast.loading('Exporting PPTX...');
        try {
            const blob = await slidesEditorApi.exportPptx({
                session_id: session.session_id,
                theme: session.theme,
                ppt_schema: {},
                edits: buildEdits(),
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'presentation.pptx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success('PPTX exported');
        } catch {
            toast.error('Export failed');
        } finally {
            toast.dismiss(toastId);
            setExporting(false);
        }
    }, [session, buildEdits]);

    return (
        <SlideEditorView
            session={session}
            loading={loading}
            error={error}
            editorState={editorState}
            canUndo={canUndo}
            canRedo={canRedo}
            activeSlide={activeSlide}
            selectedElementId={selectedElementId}
            exporting={exporting}
            onBack={() => navigate(-1)}
            onUndo={undo}
            onRedo={redo}
            onSelectSlide={(idx) => { setActiveSlide(idx); setSelectedElementId(null); }}
            onSelectElement={setSelectedElementId}
            onTextChange={handleTextChange}
            onImageUpload={handleImageUpload}
            onExport={handleExport}
        />
    );
}
