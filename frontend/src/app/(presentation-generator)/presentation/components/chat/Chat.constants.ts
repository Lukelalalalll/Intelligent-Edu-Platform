export const MESSAGE_UPDATE_FLUSH_MS = 50;

export const TOOL_LABELS: Record<string, string> = {
  getPresentationOutline: "Outline reader",
  searchSlides: "Slide search",
  getSlideAtIndex: "Slide reader",
  getPresentationThemeCatalog: "Theme catalog",
  getAvailableLayouts: "Layout finder",
  getContentSchemaFromLayoutId: "Schema checker",
  generateAssets: "Asset generator",
  saveSlide: "Slide saver",
  deleteSlide: "Slide remover",
  setPresentationTheme: "Theme applier",
};

export const MUTATING_TOOLS = new Set([
  "saveSlide",
  "deleteSlide",
  "setPresentationTheme",
]);

export const SLIDE_FOCUS_TOOLS = new Set(["saveSlide", "deleteSlide"]);

export const SLIDE_FOCUS_STATUSES = new Set(["start"]);

export const MIN_SLIDE_FOCUS_DWELL_MS = 700;
