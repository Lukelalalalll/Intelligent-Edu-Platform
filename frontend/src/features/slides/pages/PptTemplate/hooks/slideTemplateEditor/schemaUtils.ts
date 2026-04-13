export function persistSchema(setPptSchema: (schema: any) => void, schema: any): void {
  setPptSchema(schema);
  localStorage.setItem('ppt_schema', JSON.stringify(schema));
}

export function updateSchemaSlide(
  pptSchema: any,
  slideIndex: number,
  updater: (slide: any) => any,
): any {
  return {
    ...pptSchema,
    slides: pptSchema.slides.map((s: any, i: number) => (i === slideIndex ? updater(s) : s)),
  };
}

export function sanitizeBullets(content: any[]): string[] {
  return content.map((b) => String(b || '').trim()).filter((b) => b.length > 0);
}

export function readSchemaFromStorage(): { schema: any | null; error: string } {
  const saved = localStorage.getItem('ppt_schema');
  if (!saved) {
    return { schema: null, error: 'No PPT schema found. Please generate content first.' };
  }

  const schema = JSON.parse(saved);
  if (!schema || !Array.isArray(schema.slides) || schema.slides.length === 0) {
    return { schema: null, error: 'No valid slide schema found. Please finish previous steps first.' };
  }

  return { schema, error: '' };
}

export function enrichSchemaWithChapterText(schema: any): any {
  const chapterData = JSON.parse(localStorage.getItem('chapterData') || '[]');
  return {
    ...schema,
    slides: schema.slides.map((slide: any) => ({
      ...slide,
      original_text: chapterData.find((c: any) => c.sectionTitle === slide.title)?.text || '',
    })),
  };
}
