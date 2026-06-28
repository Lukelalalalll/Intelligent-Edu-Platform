import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";
import type { TranslationKey } from "@/shared/i18n";

import type {
    BuiltInTemplateCatalog,
    BuiltInTemplateGroup,
    BuiltInTemplateGroupWithItems,
    PreviewTemplateItem,
    TemplatePanelSectionCopy,
    TemplatePanelStat,
    TemplateTab,
} from "./templatePanelTypes";

type TemplateTranslator = (
    key: TranslationKey,
    vars?: Record<string, string | number>,
) => string;

const BUILT_IN_GROUP_TRANSLATION_KEYS = {
    core: {
        title: "ppt_generator.templates.builtIn.group.core.title",
        body: "ppt_generator.templates.builtIn.group.core.body",
    },
    neo: {
        title: "ppt_generator.templates.builtIn.group.neo.title",
        body: "ppt_generator.templates.builtIn.group.neo.body",
    },
} as const;

const BUILT_IN_TEMPLATE_TRANSLATION_KEYS = {
    general: {
        name: "ppt_generator.templates.family.general.name",
        description: "ppt_generator.templates.family.general.description",
    },
    modern: {
        name: "ppt_generator.templates.family.modern.name",
        description: "ppt_generator.templates.family.modern.description",
    },
    standard: {
        name: "ppt_generator.templates.family.standard.name",
        description: "ppt_generator.templates.family.standard.description",
    },
    swift: {
        name: "ppt_generator.templates.family.swift.name",
        description: "ppt_generator.templates.family.swift.description",
    },
    code: {
        name: "ppt_generator.templates.family.code.name",
        description: "ppt_generator.templates.family.code.description",
    },
    education: {
        name: "ppt_generator.templates.family.education.name",
        description: "ppt_generator.templates.family.education.description",
    },
    "product-overview": {
        name: "ppt_generator.templates.family.productOverview.name",
        description: "ppt_generator.templates.family.productOverview.description",
    },
    report: {
        name: "ppt_generator.templates.family.report.name",
        description: "ppt_generator.templates.family.report.description",
    },
    "pitch-deck": {
        name: "ppt_generator.templates.family.pitchDeck.name",
        description: "ppt_generator.templates.family.pitchDeck.description",
    },
    "neo-general": {
        name: "ppt_generator.templates.family.neoGeneral.name",
        description: "ppt_generator.templates.family.neoGeneral.description",
    },
    "neo-standard": {
        name: "ppt_generator.templates.family.neoStandard.name",
        description: "ppt_generator.templates.family.neoStandard.description",
    },
    "neo-modern": {
        name: "ppt_generator.templates.family.neoModern.name",
        description: "ppt_generator.templates.family.neoModern.description",
    },
    "neo-swift": {
        name: "ppt_generator.templates.family.neoSwift.name",
        description: "ppt_generator.templates.family.neoSwift.description",
    },
} as const;

export const INITIAL_BUILT_IN_PREVIEW_BATCH = 2;
export const INITIAL_CUSTOM_PREVIEW_BATCH = 1;
export const BUILT_IN_PREVIEW_BATCH_STEP = 2;
export const CUSTOM_PREVIEW_BATCH_STEP = 1;
export const BUILT_IN_PREVIEW_CADENCE_MS = 128;
export const CUSTOM_PREVIEW_CADENCE_MS = 168;
export const PREVIEW_ROOT_MARGIN = "160px";
export const PREVIEW_STAGGER_MS = 64;

export function buildBuiltInTemplateGroups(sourceTemplates: TemplateLayoutsWithSettings[]): BuiltInTemplateGroup[] {
    const nonNeo: TemplateLayoutsWithSettings[] = [];
    const neo: TemplateLayoutsWithSettings[] = [];

    for (const template of sourceTemplates) {
        if (template.id.startsWith("neo")) {
            neo.push(template);
        } else {
            nonNeo.push(template);
        }
    }

    return [
        {
            key: "core",
            title: "Core families",
            description: "General-purpose and domain-ready starting points for business, education, product, and report decks.",
            templates: nonNeo,
        },
        {
            key: "neo",
            title: "Neo families",
            description: "Newer PPT Generator layout systems with broader coverage for longer-form decks and refreshed pacing.",
            templates: neo,
        },
    ].filter((group) => group.templates.length > 0);
}

export function scheduleAfterPaint(callback: () => void, delayMs = 0) {
    if (typeof window === "undefined") {
        callback();
        return () => {};
    }

    const idleWindow = window as Window & {
        requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
    };

    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;
    let timeoutId: number | null = null;
    let idleCallbackId: number | null = null;

    const queueCallback = () => {
        timeoutId = window.setTimeout(() => {
            callback();
        }, delayMs);
    };

    firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(() => {
            if (typeof idleWindow.requestIdleCallback === "function") {
                idleCallbackId = idleWindow.requestIdleCallback(queueCallback, { timeout: 260 });
                return;
            }
            queueCallback();
        });
    });

    return () => {
        if (firstFrameId !== null) {
            window.cancelAnimationFrame(firstFrameId);
        }
        if (secondFrameId !== null) {
            window.cancelAnimationFrame(secondFrameId);
        }
        if (idleCallbackId !== null && typeof idleWindow.cancelIdleCallback === "function") {
            idleWindow.cancelIdleCallback(idleCallbackId);
        }
        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }
    };
}

export function buildBuiltInGroupItems(
    catalog: BuiltInTemplateCatalog | null,
    previewBudget: number,
): BuiltInTemplateGroupWithItems[] {
    let previewIndex = 0;

    return (catalog?.groups ?? []).map((group) => ({
        ...group,
        items: group.templates.map((template) => {
            const item = {
                template,
                previewPriority: previewIndex < previewBudget,
            };

            previewIndex += 1;
            return item;
        }),
    }));
}

export function buildPreviewItems<TTemplate>(
    templates: TTemplate[],
    previewBudget: number,
): PreviewTemplateItem<TTemplate>[] {
    return templates.map((template, index) => ({
        template,
        previewPriority: index < previewBudget,
    }));
}

export function getActiveTabDescription(tab: TemplateTab, t: TemplateTranslator) {
    return tab === "default"
        ? t("ppt_generator.templates.activeTab.builtIn")
        : t("ppt_generator.templates.activeTab.custom");
}

export function getTemplatePanelStats({
    builtInCount,
    builtInLoading,
    customCount,
    customLoading,
    tab,
}: {
    builtInCount: number;
    builtInLoading: boolean;
    customCount: number;
    customLoading: boolean;
    tab: TemplateTab;
}, t: TemplateTranslator): TemplatePanelStat[] {
    return [
        {
            label: t("ppt_generator.templates.stats.builtIn.label"),
            value: builtInLoading ? "..." : builtInCount,
            meta: t("ppt_generator.templates.stats.builtIn.meta"),
        },
        {
            label: t("ppt_generator.templates.stats.custom.label"),
            value: customLoading ? "..." : customCount,
            meta: customLoading
                ? t("ppt_generator.templates.stats.custom.metaLoading")
                : customCount === 1
                    ? t("ppt_generator.templates.stats.custom.metaOne")
                    : t("ppt_generator.templates.stats.custom.metaOther"),
        },
        {
            label: t("ppt_generator.templates.stats.active.label"),
            value: tab === "default"
                ? t("ppt_generator.templates.stats.active.builtIn")
                : t("ppt_generator.templates.stats.active.custom"),
            meta: tab === "default"
                ? t("ppt_generator.templates.stats.active.metaBuiltIn")
                : t("ppt_generator.templates.stats.active.metaCustom"),
        },
    ];
}

export function getTemplateSectionCopy(tab: TemplateTab, t: TemplateTranslator): TemplatePanelSectionCopy {
    return tab === "default"
        ? {
            badgeLabel: t("ppt_generator.templates.section.builtIn.badge"),
            title: t("ppt_generator.templates.section.builtIn.title"),
            description: t("ppt_generator.templates.section.builtIn.body"),
        }
        : {
            badgeLabel: t("ppt_generator.templates.section.custom.badge"),
            title: t("ppt_generator.templates.section.custom.title"),
            description: t("ppt_generator.templates.section.custom.body"),
        };
}

export function getCustomTemplatePreviewSlug(templateId: string) {
    return templateId.startsWith("custom-") ? templateId : `custom-${templateId}`;
}

export function getBuiltInGroupCopy(
    groupKey: string,
    fallbackTitle: string,
    fallbackDescription: string,
    t: TemplateTranslator,
) {
    const translationKeys = BUILT_IN_GROUP_TRANSLATION_KEYS[groupKey as keyof typeof BUILT_IN_GROUP_TRANSLATION_KEYS];

    if (!translationKeys) {
        return {
            title: fallbackTitle,
            description: fallbackDescription,
        };
    }

    return {
        title: t(translationKeys.title),
        description: t(translationKeys.body),
    };
}

export function getBuiltInTemplateCopy(
    template: Pick<TemplateLayoutsWithSettings, "description" | "id" | "name">,
    t: TemplateTranslator,
) {
    const translationKeys = BUILT_IN_TEMPLATE_TRANSLATION_KEYS[template.id as keyof typeof BUILT_IN_TEMPLATE_TRANSLATION_KEYS];

    if (!translationKeys) {
        return {
            name: template.name,
            description: template.description,
        };
    }

    return {
        name: t(translationKeys.name),
        description: t(translationKeys.description),
    };
}

