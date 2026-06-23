import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";

import type {
    BuiltInTemplateCatalog,
    BuiltInTemplateGroup,
    BuiltInTemplateGroupWithItems,
    PreviewTemplateItem,
    TemplatePanelSectionCopy,
    TemplatePanelStat,
    TemplateTab,
} from "./templatePanelTypes";

export const INITIAL_BUILT_IN_PREVIEW_BATCH = 4;
export const INITIAL_CUSTOM_PREVIEW_BATCH = 2;
export const PREVIEW_BATCH_STEP = 4;
export const PREVIEW_ROOT_MARGIN = "280px";
export const PREVIEW_STAGGER_MS = 28;

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

export function getActiveTabDescription(tab: TemplateTab) {
    return tab === "default"
        ? "Browse built-in template families grouped by Presenton style system, then jump into preview when one feels right."
        : "Open a saved custom template or start a new reusable layout set without leaving the workspace.";
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
}): TemplatePanelStat[] {
    return [
        {
            label: "Built-in families",
            value: builtInLoading ? "..." : builtInCount,
            meta: "Ready to preview from the shared Presenton library.",
        },
        {
            label: "Custom templates",
            value: customLoading ? "..." : customCount,
            meta: customLoading
                ? "Loading saved custom templates."
                : customCount === 1
                    ? "Saved custom template available."
                    : "Saved custom templates available.",
        },
        {
            label: "Active view",
            value: tab === "default" ? "Built-in" : "Custom",
            meta: tab === "default"
                ? "Grouped by Presenton style family."
                : "Create or reopen reusable custom layouts.",
        },
    ];
}

export function getTemplateSectionCopy(tab: TemplateTab): TemplatePanelSectionCopy {
    return tab === "default"
        ? {
            badgeLabel: "Built-in library",
            title: "Browse template families and jump straight into preview.",
            description: "Choose a template family first, then open preview to inspect the layouts, pacing, and deck style before generation starts.",
        }
        : {
            badgeLabel: "Custom library",
            title: "Keep reusable layouts within reach for the next deck.",
            description: "Create a fresh template or reopen a saved custom layout set without leaving the Presenton workspace.",
        };
}

export function getCustomTemplatePreviewSlug(templateId: string) {
    return templateId.startsWith("custom-") ? templateId : `custom-${templateId}`;
}
