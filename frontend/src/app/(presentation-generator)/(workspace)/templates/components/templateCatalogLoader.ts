import type { TemplateLayoutsWithSettings } from "@/app/presentation-templates/utils";

import { buildBuiltInTemplateGroups } from "./templatePanelHelpers";
import type { BuiltInTemplateCatalog } from "./templatePanelTypes";

let builtInTemplateCatalogCache: BuiltInTemplateCatalog | null = null;
let builtInTemplateCatalogRequest: Promise<BuiltInTemplateCatalog> | null = null;

export function getCachedBuiltInTemplateCatalog() {
  return builtInTemplateCatalogCache;
}

export async function loadBuiltInTemplateCatalog(): Promise<BuiltInTemplateCatalog> {
  if (builtInTemplateCatalogCache) {
    return builtInTemplateCatalogCache;
  }

  if (!builtInTemplateCatalogRequest) {
    builtInTemplateCatalogRequest = import("@/app/presentation-templates")
      .then((module) => {
        const catalogTemplates = module.templates as TemplateLayoutsWithSettings[];
        const groups = buildBuiltInTemplateGroups(catalogTemplates);
        const catalog = {
          templates: catalogTemplates,
          groups,
          count: catalogTemplates.length,
        };

        builtInTemplateCatalogCache = catalog;
        return catalog;
      })
      .finally(() => {
        builtInTemplateCatalogRequest = null;
      });
  }

  return builtInTemplateCatalogRequest;
}
