import type { DeliveryArtifactType } from '../../api/slidesApi';

export type ThemeItem = {
    name: string;
    description?: string;
    base_theme?: string;
    preview_theme?: string;
    source?: string;
    source_group?: string;
    layout_count?: number;
};

export type LayoutPlaceholder = {
    idx?: number;
    name?: string;
    type?: string | number;
    left?: number;
    top?: number;
    width?: number;
    height?: number;
};

export type LayoutItem = {
    name: string;
    placeholders?: LayoutPlaceholder[];
};

export type SlideSchemaItem = {
    title?: string;
    content?: string[];
    layout?: LayoutItem;
};

export type PptSchema = {
    presentation_title?: string;
    slides?: SlideSchemaItem[];
    theme?: string;
};

export type PreviewBlock = {
    key: string;
    left: number;
    top: number;
    width: number;
    height: number;
    type: string;
};

export type ThemePreviewCache = Record<string, LayoutItem | null>;
export type ThemeLayoutCountCache = Record<string, number>;

export type DeliveryTabItem = {
    key: DeliveryArtifactType;
    label: string;
    icon: string;
};

export type PptTemplateProps = {
    states: {
        themes: ThemeItem[];
        selectedTheme: string | null;
        pptSchema: PptSchema | null;
        errorMsg: string;
        layouts: LayoutItem[];
        currentSlideIndex: number;
    };
    handlers: {
        selectTheme: (name: string) => void;
        setCurrentSlideIndex: (index: number) => void;
        selectLayout: (layout: LayoutItem) => void;
        applyLayoutToAll: () => void;
    };
};

export type FloatingImage = {
    id: string;
    previewUrl: string;
    assetId: string;
    ext: string;
    xPct: number;   // 0–1, left position relative to slide canvas
    yPct: number;   // 0–1, top position relative to slide canvas
    wPct: number;   // 0–1, width relative to slide canvas
};
