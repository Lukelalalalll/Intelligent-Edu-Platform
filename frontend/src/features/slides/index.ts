// Barrel export for the slides feature.
// All page-level components are re-exported here so the router
// and other consumers can import from a single, stable entry point.
export { default as MdProcessorPage } from './pages/MdProcessor';
export { default as HighlighterPage } from './pages/Highlighter';
export { default as QuickProcessPage } from './pages/QuickProcess';
export { default as SpecifyPage } from './pages/Specify';
export { default as PptTemplatePage } from './pages/PptTemplate';
export { default as SlideEditorPage } from './pages/Editor';

// Shared types
export * from './types';
