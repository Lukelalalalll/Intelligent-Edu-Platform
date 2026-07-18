import type { ComponentType } from "react";
import * as z from "zod";

export type TemplateData = Record<string, unknown>;
export type TemplateComponent<TData extends TemplateData = TemplateData> =
    ComponentType<{ data: TData }>;

/**
 * Extracts default values from a Zod schema by parsing an empty object
 * This leverages Zod's built-in default handling
 */
export function getSchemaDefaults<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
    try {
        // Try to parse an empty object - Zod will fill in defaults
        return schema.parse({});
    } catch {
        // If parsing fails, try with undefined
        try {
            return schema.parse(undefined);
        } catch {
            // Return empty object as fallback
            return {} as z.infer<T>;
        }
    }
}

export function getSchemaJSON(schema: z.ZodTypeAny) {
    try {
        return z.toJSONSchema(schema)
    } catch (error) {
        console.error('Error converting schema to JSON:', error)
        throw error
    }
}

export interface TemplateLayoutDescriptor<TData extends TemplateData = TemplateData> {
    component: TemplateComponent<TData>;
    schema: z.ZodTypeAny;
    layoutId: string;
    layoutName: string;
    layoutDescription: string;
    templateName: string;
    fileName: string;
}

type TemplateEntryArgs<TData extends TemplateData = TemplateData> =
    | [TemplateLayoutDescriptor<TData>]
    | [
        TemplateComponent<TData>,
        z.ZodTypeAny,
        string,
        string,
        string,
        string,
        string,
    ];

function normalizeTemplateDescriptor<TData extends TemplateData>(
    args: TemplateEntryArgs<TData>
): TemplateLayoutDescriptor<TData> {
    if (args.length === 1) {
        return args[0];
    }

    const [
        component,
        schema,
        layoutId,
        layoutName,
        layoutDescription,
        templateName,
        fileName,
    ] = args;

    return {
        component,
        schema,
        layoutId,
        layoutName,
        layoutDescription,
        templateName,
        fileName,
    };
}

export function createTemplateEntry<TData extends TemplateData = TemplateData>(
    ...args: TemplateEntryArgs<TData>
): TemplateWithData<TData> {
    const {
        component,
        schema,
        layoutId,
        layoutName,
        layoutDescription,
        templateName,
        fileName,
    } = normalizeTemplateDescriptor(args);
    const id = `${templateName}:${layoutId}`;
    return {
        component,
        schema,
        layoutId: id,
        layoutName,
        layoutDescription,
        templateName,
        fileName,
        sampleData: getSchemaDefaults(schema) as TData,
        schemaJSON: getSchemaJSON(schema),
    };
}

/**
 * Template metadata interface
 */
export interface TemplateMetadata {
    layoutId: string;
    layoutName: string;
    layoutDescription: string;
    templateName: string;
    fileName: string;
}

/**
 * Template with component and sample data
 */
export interface TemplateWithData<TData extends TemplateData = TemplateData> extends TemplateMetadata {
    component: TemplateComponent<TData>;
    sampleData: TData;
    schema: z.ZodTypeAny;
    schemaJSON: unknown;
}

/**
 * Template group settings
 */
export interface TemplateGroupSettings {
    description: string;
    ordered: boolean;
    default: boolean;
    icon_weight?: string;
}

export interface TemplateFamilyManifest {
    id: string;
    folder: string;
    name: string;
    settings: TemplateGroupSettings;
}

// Template with settings
export interface TemplateLayoutsWithSettings {
    id: string;
    name: string;
    description: string;
    settings: TemplateGroupSettings;
    layouts: TemplateWithData[];
}

