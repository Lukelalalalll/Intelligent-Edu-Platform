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
    states: any;
    handlers: any;
};
