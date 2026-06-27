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
        title: "presenton.templates.builtIn.group.core.title",
        body: "presenton.templates.builtIn.group.core.body",
    },
    neo: {
        title: "presenton.templates.builtIn.group.neo.title",
        body: "presenton.templates.builtIn.group.neo.body",
    },
} as const;

const BUILT_IN_TEMPLATE_TRANSLATION_KEYS = {
    general: {
        name: "presenton.templates.family.general.name",
        description: "presenton.templates.family.general.description",
    },
    modern: {
        name: "presenton.templates.family.modern.name",
        description: "presenton.templates.family.modern.description",
    },
    standard: {
        name: "presenton.templates.family.standard.name",
        description: "presenton.templates.family.standard.description",
    },
    swift: {
        name: "presenton.templates.family.swift.name",
        description: "presenton.templates.family.swift.description",
    },
    code: {
        name: "presenton.templates.family.code.name",
        description: "presenton.templates.family.code.description",
    },
    education: {
        name: "presenton.templates.family.education.name",
        description: "presenton.templates.family.education.description",
    },
    "product-overview": {
        name: "presenton.templates.family.productOverview.name",
        description: "presenton.templates.family.productOverview.description",
    },
    report: {
        name: "presenton.templates.family.report.name",
        description: "presenton.templates.family.report.description",
    },
    "pitch-deck": {
        name: "presenton.templates.family.pitchDeck.name",
        description: "presenton.templates.family.pitchDeck.description",
    },
    "neo-general": {
        name: "presenton.templates.family.neoGeneral.name",
        description: "presenton.templates.family.neoGeneral.description",
    },
    "neo-standard": {
        name: "presenton.templates.family.neoStandard.name",
        description: "presenton.templates.family.neoStandard.description",
    },
    "neo-modern": {
        name: "presenton.templates.family.neoModern.name",
        description: "presenton.templates.family.neoModern.description",
    },
    "neo-swift": {
        name: "presenton.templates.family.neoSwift.name",
        description: "presenton.templates.family.neoSwift.description",
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
            description: "Newer Presenton layout systems with broader coverage for longer-form decks and refreshed pacing.",
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
        ? t("presenton.templates.activeTab.builtIn")
        : t("presenton.templates.activeTab.custom");
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
            label: t("presenton.templates.stats.builtIn.label"),
            value: builtInLoading ? "..." : builtInCount,
            meta: t("presenton.templates.stats.builtIn.meta"),
        },
        {
            label: t("presenton.templates.stats.custom.label"),
            value: customLoading ? "..." : customCount,
            meta: customLoading
                ? t("presenton.templates.stats.custom.metaLoading")
                : customCount === 1
                    ? t("presenton.templates.stats.custom.metaOne")
                    : t("presenton.templates.stats.custom.metaOther"),
        },
        {
            label: t("presenton.templates.stats.active.label"),
            value: tab === "default"
                ? t("presenton.templates.stats.active.builtIn")
                : t("presenton.templates.stats.active.custom"),
            meta: tab === "default"
                ? t("presenton.templates.stats.active.metaBuiltIn")
                : t("presenton.templates.stats.active.metaCustom"),
        },
    ];
}

export function getTemplateSectionCopy(tab: TemplateTab, t: TemplateTranslator): TemplatePanelSectionCopy {
    return tab === "default"
        ? {
            badgeLabel: t("presenton.templates.section.builtIn.badge"),
            title: t("presenton.templates.section.builtIn.title"),
            description: t("presenton.templates.section.builtIn.body"),
        }
        : {
            badgeLabel: t("presenton.templates.section.custom.badge"),
            title: t("presenton.templates.section.custom.title"),
            description: t("presenton.templates.section.custom.body"),
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
