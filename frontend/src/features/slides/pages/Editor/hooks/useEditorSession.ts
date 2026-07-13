import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { slidesEditorApi, type EditorSession, type EditorEdit } from '../../../api/slidesApi';

// ── State types ──

export type ElementEdit = { content?: string; asset_url?: string; asset_id?: string };
export type SlideEdits = Record<string, ElementEdit>;
export type EditorState = Record<number, SlideEdits>;

export type EditorAction =
    | { type: 'EDIT_TEXT'; slideIdx: number; id: string; content: string }
    | { type: 'UPLOAD_IMAGE'; slideIdx: number; id: string; asset_url: string; asset_id: string }
    | { type: 'RESET' };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
    switch (action.type) {
        case 'EDIT_TEXT': {
            const prev = state[action.slideIdx] ?? {};
            return { ...state, [action.slideIdx]: { ...prev, [action.id]: { ...prev[action.id], content: action.content } } };
        }
        case 'UPLOAD_IMAGE': {
            const prev = state[action.slideIdx] ?? {};
            return {
                ...state,
                [action.slideIdx]: {
                    ...prev,
                    [action.id]: { ...prev[action.id], asset_url: action.asset_url, asset_id: action.asset_id },
                },
            };
        }
        case 'RESET':
            return {};
        default:
            return state;
    }
}

// ── History (undo/redo) ──

function useEditorHistory(dispatch: React.Dispatch<EditorAction>) {
    const past = useRef<EditorState[]>([]);
    const future = useRef<EditorState[]>([]);
    const current = useRef<EditorState>({});

    const snapshot = useCallback((state: EditorState) => {
        past.current.push(structuredClone(current.current));
        future.current = [];
        current.current = state;
    }, []);

    const canUndo = past.current.length > 0;
    const canRedo = future.current.length > 0;

    const undo = useCallback(() => {
        if (past.current.length === 0) return;
        future.current.push(structuredClone(current.current));
        current.current = past.current.pop()!;
        dispatch({ type: 'RESET' });
        // Re-apply all edits from current snapshot
        for (const [idx, edits] of Object.entries(current.current)) {
            for (const [id, edit] of Object.entries(edits)) {
                if (edit.content !== undefined) dispatch({ type: 'EDIT_TEXT', slideIdx: Number(idx), id, content: edit.content });
                if (edit.asset_url) dispatch({ type: 'UPLOAD_IMAGE', slideIdx: Number(idx), id, asset_url: edit.asset_url, asset_id: edit.asset_id ?? '' });
            }
        }
    }, [dispatch]);

    const redo = useCallback(() => {
        if (future.current.length === 0) return;
        past.current.push(structuredClone(current.current));
        current.current = future.current.pop()!;
        dispatch({ type: 'RESET' });
        for (const [idx, edits] of Object.entries(current.current)) {
            for (const [id, edit] of Object.entries(edits)) {
                if (edit.content !== undefined) dispatch({ type: 'EDIT_TEXT', slideIdx: Number(idx), id, content: edit.content });
                if (edit.asset_url) dispatch({ type: 'UPLOAD_IMAGE', slideIdx: Number(idx), id, asset_url: edit.asset_url, asset_id: edit.asset_id ?? '' });
            }
        }
    }, [dispatch]);

    return { snapshot, canUndo, canRedo, undo, redo };
}

// ── Main hook ──

export function useEditorSession() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const location = useLocation();
    const [session, setSession] = useState<EditorSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editorState, dispatch] = useReducer(editorReducer, {});
    const { snapshot, canUndo, canRedo, undo, redo } = useEditorHistory(dispatch);

    // Load session from navigation state or API
    useEffect(() => {
        const navState = (location.state as any)?.session as EditorSession | undefined;
        if (navState && navState.session_id === sessionId) {
            setSession(navState);
            setLoading(false);
            return;
        }
        // Fallback: reload meta from backend (not implemented yet — would need a GET endpoint)
        setError('Session data not found. Please regenerate from the template page.');
        setLoading(false);
    }, [sessionId, location.state]);

    // Convert editorState into EditorEdit[] for export
    const buildEdits = useCallback((): EditorEdit[] => {
        const edits: EditorEdit[] = [];
        for (const [slideIdx, slideEdits] of Object.entries(editorState)) {
            for (const [elementId, edit] of Object.entries(slideEdits)) {
                const e: EditorEdit = { slide_index: Number(slideIdx), element_id: elementId };
                if (edit.content !== undefined) e.content = edit.content;
                if (edit.asset_id) e.image_asset_id = edit.asset_id;
                edits.push(e);
            }
        }
        return edits;
    }, [editorState]);

    // Wrapped dispatch that also records history
    const dispatchWithHistory = useCallback((action: EditorAction) => {
        if (action.type !== 'RESET') snapshot(editorState);
        dispatch(action);
    }, [editorState, snapshot]);

    return {
        session,
        loading,
        error,
        editorState,
        dispatch: dispatchWithHistory,
        buildEdits,
        canUndo,
        canRedo,
        undo,
        redo,
    };
}
