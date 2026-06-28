import type React from "react";

// ================== Core Types ==================

export interface SlideData {
  slide_number: number;
  screenshot_url: string;
  xml_content?: string;
  normalized_fonts?: string[];
  markdown_content?: string;
}

export interface UploadedFont {
  fontName: string;
  fontUrl: string;
  fontPath: string;
  resolutionKey: string;
  sourceFontName: string;
  file: File; // Original file for re-upload
}

export interface FontItem {
  name: string;
  url: string | null;
  original_name?: string | null;
  family_name?: string | null;
  variant?: string | null;
  variants?: string[] | null;
}

export interface FontData {
  available_fonts: FontItem[];
  unavailable_fonts: FontItem[];
}

export interface SelectedFontReplacement {
  original_name: string;
  original_variant: string;
  replacement_family_name: string;
  replacement_variant: string;
  replacement_label: string;
}

export type FontResolution =
  | {
      type: "upload";
      uploadedFontName: string;
    }
  | {
      type: "replacement";
      selection: SelectedFontReplacement;
    };

export type FontResolutionMap = Record<string, FontResolution | undefined>;

export function fontOriginalName(
  font: Pick<FontItem, "name" | "original_name">
): string {
  return font.original_name?.trim() || font.name.trim();
}

export function fontVariantName(font: Pick<FontItem, "variant">): string {
  return font.variant?.trim() || "regular";
}

export function fontFamilyName(
  font: Pick<FontItem, "name" | "family_name">
): string {
  return font.family_name?.trim() || font.name.trim();
}

export function fontResolutionKey(
  font: Pick<FontItem, "name" | "original_name" | "variant">
): string {
  return `${fontOriginalName(font)}::${fontVariantName(font)}`;
}

export function matchedFontOptionValue(
  font: Pick<FontItem, "name" | "family_name" | "variant">
): string {
  return `${fontFamilyName(font)}::${fontVariantName(font)}`;
}

// ================== Template Creation Flow Types ==================

export type TemplateCreationStep =
  | 'file-upload'
  | 'font-check'
  | 'font-upload'
  | 'slides-preview'
  | 'template-creation'
  | 'completed';

export interface FontUploadPreviewResponse {
  slide_image_urls: string[];
  pptx_url: string;
  modified_pptx_url: string;
  fonts: {
    [key: string]: string;
  };
}

export interface FontInfo {
  name: string;
  url?: string;
  path?: string;
}

export interface TemplateCreationInitResponse {
  id: string;
  total_slides: number;
}

export interface SlideLayoutResponse {
  slide_index: number;
  react_component: string;
  layout_id: string;
  layout_name: string;
  layout_description?: string;
}

export interface TemplateCreationState {
  step: TemplateCreationStep;
  isLoading: boolean;
  error: string | null;

  // Font check data
  fontsData: FontData | null;

  // Font upload & preview data
  previewData: FontUploadPreviewResponse | null;

  // Template creation data
  templateId: string | null;
  totalSlides: number;

  // Slide layouts
  slideLayouts: SlideLayoutResponse[];
  currentSlideIndex: number;
}

// ================== Processed Slide Types ==================

export interface ProcessedSlide extends SlideData {
  react?: string;
  uploaded_fonts?: string[];
  processing?: boolean;
  processed?: boolean;
  error?: string;
  modified?: boolean;
  layout_id?: string;
  layout_name?: string;
  layout_description?: string;
}

// ================== Component Props Types ==================

export interface EachSlideProps {
  slide: ProcessedSlide;
  index: number;
  retrySlide: (index: number) => void;
  setSlides: React.Dispatch<React.SetStateAction<ProcessedSlide[]>>;
  onSlideUpdate?: (updatedSlideData: any) => void;
  isProcessing: boolean;
  onOpenSchemaEditor?: (index: number | null) => void;
  isSchemaEditorOpen?: boolean;
  schemaPreviewData?: Record<string, any> | null;  // Preview data from schema editor AI fill
  onClearSchemaPreview?: () => void;  // Callback to clear schema preview data in parent
}

export interface FontManagerProps {
  fontsData: FontData;
  fontResolutionsByKey: FontResolutionMap;
  uploadedFonts: UploadedFont[];
  uploadFont: (font: FontItem, file: File) => string | null;
  removeFont: (resolutionKey: string) => void;
  setFontReplacement: (font: FontItem, replacement: FontItem | null) => void;
  allFontsResolved: boolean;
  onContinue: () => void | Promise<void>;
  isUploading?: boolean;
}

export interface SlidePreviewSectionProps {
  previewData: FontUploadPreviewResponse;
  onInitTemplate: () => void;
  isLoading: boolean;
}

export interface TemplateCreationProgressProps {
  currentStep: TemplateCreationStep;
  totalSlides: number;
  processedSlides: number;
}

export interface DrawingCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  slideDisplayRef: React.RefObject<HTMLDivElement>;
  strokeWidth: number;
  strokeColor: string;
  eraserMode: boolean;
  isDrawing: boolean;
  canvasDimensions: { width: number; height: number };
  onStrokeWidthChange: (width: number) => void;
  onStrokeColorChange: (color: string) => void;
  onEraserModeChange: (isEraser: boolean) => void;
  onClearCanvas: () => void;
}

