'use client'

import React, { useRef, useState, useMemo, useEffect } from "react";
import { useCompiledLayout } from "../../hooks/useCompiledLayout";
import { useSlideUndoRedo } from "../../hooks/useSlideUndoRedo";
import { EachSlideProps } from "../../types";
import { SlideContentDisplay } from "./SlideContentDisplay";
import { useSlideEdit } from "../../hooks/useSlideEdit";
import {
  Trash2,
  X,
  Check,
  Loader2,
  RotateCcw,
  Sparkles,
  Edit,
  MousePointer2,
  Undo,
  Redo
} from "lucide-react";
import Timer from "../Timer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import ToolTip from "@/components/ToolTip";
import SlideErrorBoundary from "@/app/(presentation-generator)/components/SlideErrorBoundary";
// import { CodeEditor } from "./CodeEditor";
// import SlideSelectionEditor from "./SlideSelectionEditor";
import SchemaElementHighlighter from "../SchemaElementHighlighter";


const EachSlide: React.FC<EachSlideProps> = ({
  slide,
  index,
  retrySlide,
  setSlides,
  onSlideUpdate,
  isProcessing,
  onOpenSchemaEditor,
  isSchemaEditorOpen = false,
  schemaPreviewData,
  onClearSchemaPreview,
}) => {
  const [localPreviewData, setLocalPreviewData] = useState<Record<string, any> | null>(null);

  // Use schema preview data from parent if available, otherwise use local
  const previewData = schemaPreviewData ?? localPreviewData;
  const setPreviewData = setLocalPreviewData;
  const [isEditPromptOpen, setIsEditPromptOpen] = useState(false);
  const slideDisplayRef = useRef<HTMLDivElement>(null);
  const [isSelectionEditMode, setIsSelectionEditMode] = useState(false);

  // Compile layout once and share with child components
  const compiledLayout = useCompiledLayout(slide.react);

  // Auto-retry once if compilation fails
  const hasAutoRetriedCompile = useRef(false);

  useEffect(() => {
    // Reset the flag when compilation succeeds
    if (compiledLayout) {
      hasAutoRetriedCompile.current = false;
    }
  }, [compiledLayout]);

  useEffect(() => {
    if (
      slide.react &&
      slide.processed &&
      !slide.processing &&
      !compiledLayout &&
      !hasAutoRetriedCompile.current
    ) {
      hasAutoRetriedCompile.current = true;
      console.log(`Auto-retrying slide ${index + 1} after compile failure...`);
      retrySlide(index);
    }
  }, [slide.react, slide.processed, slide.processing, compiledLayout, index, retrySlide]);

  // Get sample data for schema-element highlighting
  const sampleData = useMemo(() => {
    if (previewData) return previewData;
    if (compiledLayout?.sampleData && Object.keys(compiledLayout.sampleData).length > 0) {
      return compiledLayout.sampleData;
    }
    try {
      return compiledLayout?.schema?.parse({}) ?? null;
    } catch {
      return null;
    }
  }, [compiledLayout, previewData]);

  // Undo/Redo functionality for this slide
  const {
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSlideUndoRedo(slide, setSlides, index);

  const {
    isUpdating,
    prompt,
    setPrompt,
    handleSave,
    handleEditClick,
    handleCancelEdit,
  } = useSlideEdit(slide, index, onSlideUpdate, setSlides);

  // Handle retry slide
  const handleRetrySlide = () => {
    retrySlide(index);
  };

  const closeEditPrompt = () => {
    setIsEditPromptOpen(false);
    handleCancelEdit();
  };

  const submitEditPrompt = async () => {

    if (isUpdating) return;

    await handleSave();
    setIsEditPromptOpen(false);
    setPrompt("");

  };

  // Clear preview data - clears both local and parent state
  const handleClearPreview = () => {
    setPreviewData(null);
    onClearSchemaPreview?.();
  };



  // Handle delete slide
  const handleDeleteSlide = () => {
    // warmin
    const confirmed = window.confirm(
      `Are you sure you want to delete slide ${index + 1}? This action cannot be undone.`
    );
    if (!confirmed) return;
    setSlides(prev => prev.filter((_, i) => i !== index));
  };

  const isSlideReady = slide.processed && !slide.processing;
  const isSlideProcessing = slide.processing;
  const hasError = !!slide.error;

  return (
    <div className="group relative mx-auto max-w-[1440px] overflow-hidden rounded-lg border border-[#dbe7e2] bg-white transition-all duration-300 hover:border-[#bfd7cd] hover:shadow-lg">
      {/* Slide Header */}
      <div className="border-b border-[#e6efeb] bg-gradient-to-r from-[#fbfdfc] to-white px-5 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Slide Info */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(0,123,85,0.1)] text-sm font-semibold text-[var(--primary-color,#007B55)]">
              {index + 1}
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-[#15342d]">
                {compiledLayout?.layoutId || `Slide ${index + 1}`}
              </h3>
              {compiledLayout?.layoutDescription && (
                <p className="mt-0.5 line-clamp-1 max-w-[300px] text-sm text-[#527267]">
                  {compiledLayout.layoutDescription}
                </p>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            {/* Primary Actions Group */}
            <div className="flex items-center gap-0.5 rounded-lg bg-[#f6faf8] p-1">
              {/* AI Edit Button */}
              <Popover
                open={isEditPromptOpen}
                onOpenChange={(open) => {
                  setIsEditPromptOpen(open);
                  if (open) handleEditClick();
                  else handleCancelEdit();
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    disabled={!isSlideReady}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                      rounded-md transition-all duration-150
                      ${!isSlideReady
                        ? "opacity-40 cursor-not-allowed text-gray-400"
                        : "text-gray-600 hover:bg-white hover:text-[var(--primary-color,#007B55)] hover:shadow-sm"
                      }
                    `}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Edit</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={8}
                  className="w-[380px] p-0 rounded-xl border border-gray-200 shadow-2xl bg-white"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--primary-color,#007B55)] shadow-sm">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-800">AI Edit</span>
                          <p className="text-[10px] text-gray-400">Apply AI edits & tweaks</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={closeEditPrompt}
                        disabled={isUpdating}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={3}
                      autoFocus
                      placeholder="What changes would you like? e.g., 'Make the title larger' or 'Change colors to blue theme'"
                      disabled={isUpdating}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 transition-all focus:border-[var(--primary-color,#007B55)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[rgba(0,123,85,0.16)]"
                    />

                    <div className="flex justify-end mt-3">
                      <button
                        type="button"
                        onClick={submitEditPrompt}
                        disabled={isUpdating || !prompt.trim()}
                        className={`
                          inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all
                          ${isUpdating || !prompt.trim()
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-[var(--primary-color,#007B55)] text-white hover:bg-[var(--primary-dark,#006644)] shadow-sm hover:shadow-md"
                          }
                        `}
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Applying...
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Apply
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Schema Button */}
              <ToolTip content="Edit content schema">
                <button
                  onClick={() => {
                    if (isSchemaEditorOpen) {
                      onOpenSchemaEditor?.(null);
                    } else {
                      onOpenSchemaEditor?.(index);
                    }
                  }}
                  disabled={!isSlideReady}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${isSchemaEditorOpen
                    ? "bg-[rgba(0,123,85,0.12)] text-[var(--primary-color,#007B55)]"
                    : "text-gray-600 hover:bg-white hover:text-[var(--primary-color,#007B55)] hover:shadow-sm"
                    }`}
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Schema</span>
                </button>
              </ToolTip>

              {/* Code Button */}
              {/* <ToolTip content="Edit source code">
                <button
                  onClick={() => setShowCodeEditor(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all duration-150"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Code</span>
                </button>
              </ToolTip> */}

              {/* Select Edit Button */}
              {/* <ToolTip content={isSelectionEditMode ? "Exit selection mode" : "Click elements to edit"}>
                <button
                  onClick={() => setIsSelectionEditMode(!isSelectionEditMode)}
                  disabled={!isSlideReady}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                    rounded-md transition-all duration-150
                    ${isSelectionEditMode
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-gray-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm"
                    }
                    disabled:opacity-40 disabled:cursor-not-allowed
                  `}
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                  <span>{isSelectionEditMode ? "Exit" : "Select"}</span>
                </button>
              </ToolTip> */}
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-200 mx-1" />

            {/* Undo/Redo Group */}
            <div className="flex items-center gap-0.5 rounded-lg bg-[#f6faf8] p-1">
              <ToolTip content={canUndo ? "Undo (Ctrl+Z)" : "Nothing to undo"}>
                <button
                  onClick={undo}
                  disabled={!canUndo || !isSlideReady}
                  className={`
                    inline-flex items-center justify-center w-8 h-8
                    rounded-md transition-all duration-150
                    ${!canUndo || !isSlideReady
                      ? "opacity-40 cursor-not-allowed text-gray-400"
                      : "text-gray-600 hover:bg-white hover:text-[var(--primary-color,#007B55)] hover:shadow-sm"
                    }
                  `}
                >
                  <Undo className="w-4 h-4" />
                </button>
              </ToolTip>
              <ToolTip content={canRedo ? "Redo (Ctrl+Shift+Z)" : "Nothing to redo"}>
                <button
                  onClick={redo}
                  disabled={!canRedo || !isSlideReady}
                  className={`
                    inline-flex items-center justify-center w-8 h-8
                    rounded-md transition-all duration-150
                    ${!canRedo || !isSlideReady
                      ? "opacity-40 cursor-not-allowed text-gray-400"
                      : "text-gray-600 hover:bg-white hover:text-[var(--primary-color,#007B55)] hover:shadow-sm"
                    }
                  `}
                >
                  <Redo className="w-4 h-4" />
                </button>
              </ToolTip>
            </div>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-200 mx-1" />

            {/* Re-Construct Button */}
            <ToolTip content="Re-Design this slide">
              <button
                onClick={handleRetrySlide}
                disabled={!isSlideReady}
                className={`
                      inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                      rounded-full transition-all duration-200
                      ${!isSlideReady
                    ? "cursor-not-allowed bg-gradient-to-r from-[#F3F4F6] to-[#E5E7EB] text-[#9CA3AF] opacity-40"
                    : "text-white shadow-sm hover:shadow-md"
                  }
                    `}
                style={isSlideReady ? {
                  background: 'linear-gradient(135deg, var(--primary-color,#007B55) 0%, #0a6b58 45%, var(--primary-dark,#006644) 100%)',
                } : undefined}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-Construct
              </button>

            </ToolTip>

            {/* Delete Button */}
            <ToolTip content="Delete slide">
              <button
                onClick={handleDeleteSlide}
                disabled={!isSlideReady}
                className={`
                  p-1.5 rounded-lg border transition-all duration-150
                  ${!isSlideReady
                    ? "opacity-40 cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400"
                    : "bg-white border-gray-200 text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                  }
                `}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </ToolTip>
          </div>
        </div>

        {/* Processing Timer - Only show here, not in SlideContentDisplay */}
        {isSlideProcessing && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--primary-color,#007B55)]" />
              <span className="text-sm font-medium text-[var(--primary-color,#007B55)]">Generating slide layout...</span>
            </div>
            <Timer duration={120} />
          </div>
        )}
      </div>

      {/* Slide Content */}
      <div className="p-4">
        <SlideErrorBoundary
          label={`Slide ${index + 1}`}
          resetKey={`${slide.processing}:${slide.processed}:${slide.react}`}
        >
          {/* Selection Edit Mode Banner */}
          {isSelectionEditMode && slide.processed && !slide.processing && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-[rgba(0,123,85,0.18)] bg-[rgba(0,123,85,0.08)] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-color,#007B55)]">
                  <MousePointer2 className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-medium text-[var(--primary-dark,#006644)]">
                  Selection edit mode | Click on any element to edit with AI
                </span>
              </div>
              <button
                onClick={() => setIsSelectionEditMode(false)}
                className="h-8 rounded-md px-3 text-sm font-medium text-[var(--primary-color,#007B55)] transition-colors hover:bg-[rgba(0,123,85,0.1)] hover:text-[var(--primary-dark,#006644)]"
              >
                Exit
              </button>
            </div>
          )}
          <div className="relative">
            <SlideContentDisplay
              slide={slide}
              compiledLayout={compiledLayout}
              previewData={previewData}
              retrySlide={handleRetrySlide}
              onClearPreview={handleClearPreview}
              slideDisplayRef={slideDisplayRef}
            />
            {/* Schema-Element Highlighting Overlay - active when schema editor is open */}
            {isSchemaEditorOpen && slide.processed && !slide.processing && (
              <SchemaElementHighlighter
                containerRef={slideDisplayRef}
                sampleData={sampleData}
                isActive={isSchemaEditorOpen}
              />
            )}
            {/* Selection Editor Overlay */}
            {/* {isSelectionEditMode && slide.processed && !slide.processing && (
              <SlideSelectionEditor
                containerRef={slideDisplayRef}
                slide={slide}
                onSlideUpdate={handleSelectionUpdate}
              />
            )} */}
          </div>
        </SlideErrorBoundary>
      </div>

      {/* Status Indicator */}
      {hasError && (
        <div className="absolute top-3 right-3">
          <div className="w-3 h-3 rounded-full bg-[#EF4444] animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default EachSlide;
