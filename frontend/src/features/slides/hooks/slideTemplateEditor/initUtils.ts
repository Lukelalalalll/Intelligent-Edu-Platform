import client from '../../../../api/client';
import { enrichSchemaWithChapterText, readSchemaFromStorage } from './schemaUtils';

export async function initializeTemplateEditorData(): Promise<{
  schema: any | null;
  initialTheme: string | null;
  themes: any[];
  error: string;
}> {
  let schema: any | null = null;
  let initialTheme: string | null = null;
  let error = '';

  const schemaResult = readSchemaFromStorage();
  if (schemaResult.error) {
    error = schemaResult.error;
  } else if (schemaResult.schema) {
    schema = enrichSchemaWithChapterText(schemaResult.schema);
    initialTheme = schema.theme || null;
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
