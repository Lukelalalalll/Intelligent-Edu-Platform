import codeSettings from "./Code/settings.json";
import educationSettings from "./Education/settings.json";
import generalSettings from "./general/settings.json";
import modernSettings from "./modern/settings.json";
import neoGeneralSettings from "./neo-general/settings.json";
import neoModernSettings from "./neo-modern/settings.json";
import neoStandardSettings from "./neo-standard/settings.json";
import neoSwiftSettings from "./neo-swift/settings.json";
import pitchDeckSettings from "./pitch-deck/settings.json";
import productOverviewSettings from "./ProductOverview/settings.json";
import reportSettings from "./Report/settings.json";
import standardSettings from "./standard/settings.json";
import swiftSettings from "./swift/settings.json";
import * as z from "zod";

import {
    createTemplateEntry,
    type TemplateComponent,
    type TemplateData,
    type TemplateFamilyManifest,
    type TemplateLayoutsWithSettings,
    type TemplateWithData,
} from "./utils";

type TemplateModule = {
    default?: TemplateComponent;
    Schema?: z.ZodTypeAny;
    layoutId?: unknown;
    layoutName?: unknown;
    layoutDescription?: unknown;
};

type TemplateFamilyId =
    | "general"
    | "modern"
    | "standard"
    | "swift"
    | "code"
    | "education"
    | "product-overview"
    | "report"
    | "pitch-deck"
    | "neo-general"
    | "neo-standard"
    | "neo-modern"
    | "neo-swift";

export const TEMPLATE_FAMILY_MANIFESTS = [
    { id: "general", folder: "general", name: "General", settings: generalSettings },
    { id: "modern", folder: "modern", name: "Modern", settings: modernSettings },
    { id: "standard", folder: "standard", name: "Standard", settings: standardSettings },
    { id: "swift", folder: "swift", name: "Swift", settings: swiftSettings },
    { id: "code", folder: "Code", name: "Code", settings: codeSettings },
    { id: "education", folder: "Education", name: "Education", settings: educationSettings },
    {
        id: "product-overview",
        folder: "ProductOverview",
        name: "Product Overview",
        settings: productOverviewSettings,
    },
    { id: "report", folder: "Report", name: "Report", settings: reportSettings },
    { id: "pitch-deck", folder: "pitch-deck", name: "Pitch Deck", settings: pitchDeckSettings },
    { id: "neo-general", folder: "neo-general", name: "Neo General", settings: neoGeneralSettings },
    { id: "neo-standard", folder: "neo-standard", name: "Neo Standard", settings: neoStandardSettings },
    { id: "neo-modern", folder: "neo-modern", name: "Neo Modern", settings: neoModernSettings },
    { id: "neo-swift", folder: "neo-swift", name: "Neo Swift", settings: neoSwiftSettings },
] as const satisfies readonly TemplateFamilyManifest[];

export const TEMPLATE_FAMILY_ORDER = TEMPLATE_FAMILY_MANIFESTS.map((manifest) => manifest.id) as TemplateFamilyId[];

const FAMILY_MANIFEST_BY_FOLDER = new Map(
    TEMPLATE_FAMILY_MANIFESTS.map((manifest) => [manifest.folder, manifest] as const),
);

const templateModules = import.meta.glob<TemplateModule>("./*/*.tsx", { eager: true });

const templateLayoutsByFamily = Object.fromEntries(
    TEMPLATE_FAMILY_MANIFESTS.map((manifest) => [manifest.id, [] as TemplateWithData[]] as const),
) as Record<TemplateFamilyId, TemplateWithData[]>;

function isTemplateModule(module: TemplateModule): module is Required<Pick<TemplateModule, "default" | "Schema" | "layoutId" | "layoutName" | "layoutDescription">> {
    return Boolean(
        module.default &&
        module.Schema &&
        typeof module.layoutId === "string" &&
        typeof module.layoutName === "string" &&
        typeof module.layoutDescription === "string"
    );
}

function resolveFamilyId(filePath: string): TemplateFamilyId | null {
    const match = /^\.\/([^/]+)\/[^/]+\.tsx$/.exec(filePath);
    if (!match) return null;
    const manifest = FAMILY_MANIFEST_BY_FOLDER.get(match[1]);
    return (manifest?.id as TemplateFamilyId | undefined) ?? null;
}

function resolveFileName(filePath: string): string {
    const fileName = filePath.split("/").pop() || "";
    return fileName.replace(/\.tsx$/, "");
}

for (const [filePath, module] of Object.entries(templateModules).sort(([a], [b]) => a.localeCompare(b))) {
    const familyId = resolveFamilyId(filePath);
    if (!familyId || !isTemplateModule(module)) {
        continue;
    }

    templateLayoutsByFamily[familyId].push(
        createTemplateEntry({
            component: module.default,
            schema: module.Schema,
            layoutId: module.layoutId,
            layoutName: module.layoutName,
            layoutDescription: module.layoutDescription,
            templateName: familyId,
            fileName: resolveFileName(filePath),
        }),
    );
}

const templateCatalogById = Object.fromEntries(
    TEMPLATE_FAMILY_MANIFESTS.map((manifest) => [
        manifest.id,
        {
            id: manifest.id,
            name: manifest.name,
            description: manifest.settings.description,
            settings: manifest.settings,
            layouts: templateLayoutsByFamily[manifest.id],
        } satisfies TemplateLayoutsWithSettings,
    ] as const),
) as Record<TemplateFamilyId, TemplateLayoutsWithSettings>;

const templateLookupById = new Map(
    TEMPLATE_FAMILY_ORDER.map((id) => [id, templateCatalogById[id]] as const),
);

export const generalTemplates = templateCatalogById.general.layouts;
export const modernTemplates = templateCatalogById.modern.layouts;
export const standardTemplates = templateCatalogById.standard.layouts;
export const swiftTemplates = templateCatalogById.swift.layouts;
export const codeTemplates = templateCatalogById.code.layouts;
export const educationTemplates = templateCatalogById.education.layouts;
export const productOverviewTemplates = templateCatalogById["product-overview"].layouts;
export const reportTemplates = templateCatalogById.report.layouts;
export const pitchDeckTemplates = templateCatalogById["pitch-deck"].layouts;
export const neoGeneralTemplates = templateCatalogById["neo-general"].layouts;
export const neoStandardTemplates = templateCatalogById["neo-standard"].layouts;
export const neoModernTemplates = templateCatalogById["neo-modern"].layouts;
export const neoSwiftTemplates = templateCatalogById["neo-swift"].layouts;

export const templates: TemplateLayoutsWithSettings[] = TEMPLATE_FAMILY_ORDER.map((id) => templateCatalogById[id]);
export const allLayouts: TemplateWithData[] = templates.flatMap((template) => template.layouts);

const layoutLookupById = new Map(allLayouts.map((layout) => [layout.layoutId, layout] as const));

export interface TemplateSchemaSummary {
    id: string;
    name: string;
    description: string;
    json_schema: unknown;
}

export function getTemplatesByTemplateName(templateId: string): TemplateWithData[] {
    return templateLookupById.get(templateId)?.layouts || [];
}

export function getSchemaByTemplateId(templateId: string): TemplateSchemaSummary[] {
    return getTemplatesByTemplateName(templateId).map((layout) => ({
        id: layout.layoutId,
        name: layout.layoutName,
        description: layout.layoutDescription,
        json_schema: layout.schemaJSON,
    }));
}

export function getSettingsByTemplateId(templateId: string) {
    return templateLookupById.get(templateId)?.settings;
}

export function getTemplateByLayoutId(layoutId: string): TemplateWithData | undefined {
    return layoutLookupById.get(layoutId);
}

export function getLayoutByLayoutId(layout: string, layoutGroup?: string): TemplateWithData | undefined {
    const normalizedLayout = layout.trim();
    if (!normalizedLayout) return undefined;

    const directMatch = layoutLookupById.get(normalizedLayout);
    if (directMatch) return directMatch;

    if (normalizedLayout.includes(":")) {
        const [templateId] = normalizedLayout.split(":");
        const template = templateLookupById.get(templateId as TemplateFamilyId);
        const qualified = template?.layouts.find((item) => item.layoutId === normalizedLayout);
        if (qualified) return qualified;
    }

    if (layoutGroup) {
        const familyMatch = templateLookupById.get(layoutGroup as TemplateFamilyId);
        const qualified = familyMatch?.layouts.find((item) => item.layoutId === `${layoutGroup}:${normalizedLayout}`);
        if (qualified) return qualified;
    }

    return allLayouts.find((item) => item.layoutId.endsWith(`:${normalizedLayout}`));
}
