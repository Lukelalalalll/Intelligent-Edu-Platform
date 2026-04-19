import client from '@/shared/api/client';
import { enrichSchemaWithChapterText, readSchemaFromStorage } from './schemaUtils';

type InitOptions = {
  preferredSchema?: any | null;
};

export async function initializeTemplateEditorData(options?: InitOptions): Promise<{
  schema: any | null;
  initialTheme: string | null;
  themes: any[];
  error: string;
}> {
  let schema: any | null = null;
  let initialTheme: string | null = null;
  let error = '';

  if (options?.preferredSchema && Array.isArray(options.preferredSchema?.slides) && options.preferredSchema.slides.length > 0) {
    schema = enrichSchemaWithChapterText(options.preferredSchema);
    initialTheme = schema.theme || null;
    // Keep storage in sync so refresh stays consistent with current run.
    localStorage.setItem('ppt_schema', JSON.stringify(schema));
  }

  if (!schema) {
    const schemaResult = readSchemaFromStorage();
    if (schemaResult.error) {
      error = schemaResult.error;
    } else if (schemaResult.schema) {
      schema = enrichSchemaWithChapterText(schemaResult.schema);
      initialTheme = schema.theme || null;
    }
  }

  const res = await client.get('/slides/get_themes');
  const themes = Array.isArray(res.data) ? res.data : [];

  if (themes.length > 0) {
    const availableThemeNames = new Set(themes.map((t: any) => t?.name).filter(Boolean));
    if (!initialTheme || !availableThemeNames.has(initialTheme)) {
      initialTheme = themes[0]?.name || null;
    }
  }

  return { schema, initialTheme, themes, error };
}
