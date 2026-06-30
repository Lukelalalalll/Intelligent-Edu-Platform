import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/shared/i18n";
import {
    DEFAULT_LOCALE,
    TRANSLATIONS,
    type Locale,
    type TranslationKey,
} from "@/shared/i18n/translations";

import {
    BuiltInTemplateCard,
    CustomTemplateCard,
} from "./TemplatePanelCards";
import { getBuiltInGroupCopy } from "./templatePanelHelpers";

vi.mock("@/app/hooks/useCustomTemplates", () => ({
    useCustomTemplatePreview: () => ({
        previewLayouts: [],
        loading: false,
    }),
}));

vi.mock("../../../components/TemplatePreviewComponents", () => ({
    CustomTemplatePreview: () => <div>custom-preview</div>,
    InbuiltTemplatePreview: () => <div>built-in-preview</div>,
    LayoutsBadge: ({ count }: { count: number }) => <span>{count} layouts</span>,
    TemplatePreviewFallback: () => <div>preview-fallback</div>,
    TemplatePreviewStage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function interpolate(template: string, vars?: Record<string, string | number>) {
    if (!vars) {
        return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const value = vars[key];
        return value === undefined ? match : String(value);
    });
}

function buildTranslator(locale: Locale) {
    return (key: TranslationKey, vars?: Record<string, string | number>) => {
        const template = TRANSLATIONS[locale][key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
        return interpolate(template, vars);
    };
}

function renderWithLocale(locale: Locale, ui: React.ReactElement) {
    window.localStorage.setItem("appLanguage", locale);
    return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("TemplatePanelCards", () => {
    beforeEach(() => {
        const storage = new Map<string, string>();
        const localStorageMock = {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value);
            },
            removeItem: (key: string) => {
                storage.delete(key);
            },
            clear: () => {
                storage.clear();
            },
        };

        Object.defineProperty(window, "localStorage", {
            value: localStorageMock,
            configurable: true,
        });
    });

    it("returns localized built-in group copy for zh-CN and zh-HK", () => {
        const zhCN = buildTranslator("zh-CN");
        const zhHK = buildTranslator("zh-HK");

        expect(
            getBuiltInGroupCopy("core", "Core families", "fallback", zhCN),
        ).toEqual({
            title: "核心系列",
            description: "面向商业、教育、产品和报告场景的通用与行业起步模板。",
        });

        expect(
            getBuiltInGroupCopy("neo", "Neo families", "fallback", zhHK),
        ).toEqual({
            title: "Neo 系列",
            description: "更新一代嘅 PPT Generator 版面系統，特別啱長篇內容同更新鮮嘅節奏。",
        });
    });

    it("renders built-in family copy in zh-CN", () => {
        renderWithLocale(
            "zh-CN",
            <BuiltInTemplateCard
                template={{
                    id: "general",
                    name: "General",
                    description: "General purpose layouts for common presentation elements",
                    settings: {
                        description: "",
                        ordered: false,
                        default: false,
                    },
                    layouts: [
                        {
                            component: () => null,
                            sampleData: {},
                            schema: {} as never,
                            schemaJSON: {},
                            layoutId: "general:hero",
                            layoutName: "Hero",
                            layoutDescription: "Hero slide",
                            templateName: "general",
                            fileName: "Hero.tsx",
                        },
                    ],
                }}
                previewPriority={false}
                onOpen={() => {}}
            />,
        );

        expect(screen.getByRole("heading", { name: "通用" })).toBeInTheDocument();
        expect(screen.getByText("适用于常见演示元素的通用布局。")).toBeInTheDocument();
        expect(screen.getByText("内置系列")).toBeInTheDocument();
    });

    it("renders a localized fallback name for unnamed custom templates", () => {
        renderWithLocale(
            "zh-HK",
            <CustomTemplateCard
                template={{
                    id: "custom-42",
                    name: "   ",
                    layoutCount: 2,
                    isCustom: true,
                }}
                previewPriority={false}
                onOpen={() => {}}
            />,
        );

        expect(screen.getByRole("heading", { name: "自訂模板" })).toBeInTheDocument();
        expect(screen.getByText("喺預覽入面打開呢個自訂模板，繼續打磨佢嘅可重用版面組合。")).toBeInTheDocument();
    });
});
