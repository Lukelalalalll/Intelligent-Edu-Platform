import { useCallback, useMemo, useReducer } from 'react';
import type { FloatingImage } from '../types';

type TextEdits = Record<number, Record<string, string>>;
type FloatingImages = Record<number, FloatingImage[]>;

type EditorState = {
    selectedElementId: string | null;
    uploadingFreeImage: boolean;
    textEdits: TextEdits;
    floatingImages: FloatingImages;
};

type EditorAction =
    | { type: 'reset_all' }
    | { type: 'set_selected_element'; payload: string | null }
    | { type: 'set_uploading'; payload: boolean }
    | { type: 'set_text_edit'; payload: { slideIndex: number; elementId: string; content: string } }
    | { type: 'add_floating_image'; payload: { slideIndex: number; image: FloatingImage } }
    | { type: 'move_floating_image'; payload: { slideIndex: number; imageId: string; xPct: number; yPct: number } }
    | { type: 'remove_floating_image'; payload: { slideIndex: number; imageId: string } }
    | { type: 'clear_edits' };

const initialState: EditorState = {
    selectedElementId: null,
    uploadingFreeImage: false,
    textEdits: {},
    floatingImages: {},
};

function reducer(state: EditorState, action: EditorAction): EditorState {
    switch (action.type) {
        case 'reset_all':
            return { ...initialState };
        case 'set_selected_element':
            return { ...state, selectedElementId: action.payload };
        case 'set_uploading':
            return { ...state, uploadingFreeImage: action.payload };
        case 'set_text_edit': {
            const { slideIndex, elementId, content } = action.payload;
            return {
                ...state,
                textEdits: {
                    ...state.textEdits,
                    [slideIndex]: {
                        ...(state.textEdits[slideIndex] ?? {}),
                        [elementId]: content,
                    },
                },
            };
        }
        case 'add_floating_image': {
            const { slideIndex, image } = action.payload;
            return {
                ...state,
                floatingImages: {
                    ...state.floatingImages,
                    [slideIndex]: [...(state.floatingImages[slideIndex] ?? []), image],
                },
            };
        }
        case 'move_floating_image': {
            const { slideIndex, imageId, xPct, yPct } = action.payload;
            return {
                ...state,
                floatingImages: {
                    ...state.floatingImages,
                    [slideIndex]: (state.floatingImages[slideIndex] ?? []).map((image) =>
                        image.id === imageId ? { ...image, xPct, yPct } : image,
                    ),
                },
            };
        }
        case 'remove_floating_image': {
            const { slideIndex, imageId } = action.payload;
            return {
                ...state,
                floatingImages: {
                    ...state.floatingImages,
                    [slideIndex]: (state.floatingImages[slideIndex] ?? []).filter((image) => image.id !== imageId),
                },
            };
        }
        case 'clear_edits':
            return {
                ...state,
                selectedElementId: null,
                textEdits: {},
                floatingImages: {},
            };
        default:
            return state;
    }
}

export function useEditorState() {
    const [state, dispatch] = useReducer(reducer, initialState);

    const setSelectedElementId = useCallback((id: string | null) => {
        dispatch({ type: 'set_selected_element', payload: id });
    }, []);

    const setUploadingFreeImage = useCallback((value: boolean) => {
        dispatch({ type: 'set_uploading', payload: value });
    }, []);

    const resetAll = useCallback(() => {
        dispatch({ type: 'reset_all' });
    }, []);

    const clearEdits = useCallback(() => {
        dispatch({ type: 'clear_edits' });
    }, []);

    const setTextEdit = useCallback((slideIndex: number, elementId: string, content: string) => {
        dispatch({ type: 'set_text_edit', payload: { slideIndex, elementId, content } });
    }, []);

    const addFloatingImage = useCallback((slideIndex: number, image: FloatingImage) => {
        dispatch({ type: 'add_floating_image', payload: { slideIndex, image } });
    }, []);

    const moveFloatingImage = useCallback((slideIndex: number, imageId: string, xPct: number, yPct: number) => {
        dispatch({ type: 'move_floating_image', payload: { slideIndex, imageId, xPct, yPct } });
    }, []);

    const removeFloatingImage = useCallback((slideIndex: number, imageId: string) => {
        dispatch({ type: 'remove_floating_image', payload: { slideIndex, imageId } });
    }, []);

    const hasUnsavedTextEdits = useMemo(
        () => Object.values(state.textEdits).some((editMap) => Object.keys(editMap).length > 0),
        [state.textEdits],
    );

    const hasUnsavedImages = useMemo(
        () => Object.values(state.floatingImages).some((images) => images.length > 0),
        [state.floatingImages],
    );

    return {
        selectedElementId: state.selectedElementId,
        uploadingFreeImage: state.uploadingFreeImage,
        textEdits: state.textEdits,
        floatingImages: state.floatingImages,
        hasUnsavedEdits: hasUnsavedTextEdits || hasUnsavedImages,
        setSelectedElementId,
        setUploadingFreeImage,
        setTextEdit,
        addFloatingImage,
        moveFloatingImage,
        removeFloatingImage,
        resetAll,
        clearEdits,
    };
}
