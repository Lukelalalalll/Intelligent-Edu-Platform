import type { CustomTemplates } from "@/app/hooks/useCustomTemplates";
import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";

export type TemplateTab = "custom" | "default";

export type BuiltInTemplateGroup = {
    key: string;
    title: string;
    description: string;
    templates: TemplateLayoutsWithSettings[];
};

export type BuiltInTemplateCatalog = {
    templates: TemplateLayoutsWithSettings[];
    groups: BuiltInTemplateGroup[];
    count: number;
};

export type PreviewTemplateItem<TTemplate> = {
    template: TTemplate;
    previewPriority: boolean;
};

export type BuiltInTemplateGroupWithItems = BuiltInTemplateGroup & {
    items: PreviewTemplateItem<TemplateLayoutsWithSettings>[];
};

export type TemplatePanelStat = {
    label: string;
    value: string | number;
    meta: string;
};

export type TemplatePanelSectionCopy = {
    badgeLabel: string;
    title: string;
    description: string;
};

export type BuiltInLibraryState = {
    count: number;
    groups: BuiltInTemplateGroupWithItems[];
    isLoading: boolean;
    hasCatalog: boolean;
};

export type CustomLibraryState = {
    count: number;
    items: PreviewTemplateItem<CustomTemplates>[];
    isLoading: boolean;
};
