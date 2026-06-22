import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Type,
  ChevronRight,
  FileType,
  Info,
} from "lucide-react";
import { FontManagerProps, FontItem } from "../types";
import styles from "../customTemplateWorkbench.module.css";

const fontUploadKey = (font: FontItem) => font.name;

const FontManager: React.FC<FontManagerProps> = ({
  fontsData,
  uploadedFonts,
  uploadFont,
  removeFont,
  onContinue,
  isUploading = false,
}) => {
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Get fonts that still need to be uploaded (unavailable fonts not yet uploaded)
  const isFontUploaded = (font: FontItem) =>
    uploadedFonts.some(
      (uploaded) =>
        uploaded.fontName === font.name ||
        (font.original_name && uploaded.fontName === font.original_name)
    );

  const fontsNeedingUpload = fontsData.unavailable_fonts.filter(
    (font) => !isFontUploaded(font)
  );

  const allFontsUploaded = fontsNeedingUpload.length === 0;
  const hasAvailableFonts = fontsData.available_fonts.length > 0;
  const hasUploadedFonts = uploadedFonts.length > 0;

  const handleFontUpload = (fontName: string, file: File) => {
    if (!file) return;

    const result = uploadFont(fontName, file);

    if (result && fileInputRefs.current[fontName]) {
      fileInputRefs.current[fontName]!.value = "";
    }
  };

  const handleFileInputChange = (
    fontName: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFontUpload(fontName, file);
    }
  };

  return (
    <div className={styles.grid}>
      <div className={styles.stack}>
        <section className={styles.card}>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[rgba(0,123,85,0.1)] text-[var(--primary-color,#007B55)]">
              <Type className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[#15342d]">Font Management</h2>
              <p className="mt-0.5 text-sm text-[#527267]">
                {allFontsUploaded
                  ? "All fonts are ready! You can proceed to preview."
                  : "Upload missing fonts to ensure your presentation displays correctly."}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-6">
          {hasAvailableFonts && (
            <div className="rounded-lg border border-[#b8e2cc] bg-[#f1fbf5] p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-[#0f6b3f]" />
                <h4 className="text-sm font-semibold text-[#0f6b3f]">
                  Available Fonts ({fontsData.available_fonts.length})
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {fontsData.available_fonts.map((font, index) => (
                  <span
                    key={index}
                    className="rounded-full border border-[#d8ebdf] bg-white px-3 py-1.5 text-xs font-medium text-[#0f6b3f]"
                  >
                    {font.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fonts Needing Upload */}
          {fontsNeedingUpload.length > 0 && (
            <div className="rounded-lg border border-[#f2d58d] bg-[#fff8eb] p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-[#8a5a13]" />
                <h4 className="text-sm font-semibold text-[#8a5a13]">
                  Missing Fonts ({fontsNeedingUpload.length})
                </h4>
              </div>

              <div className="space-y-3">
                {fontsNeedingUpload.map((font, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-[#f2d58d] bg-white p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fff2cf]">
                        <FileType className="h-5 w-5 text-[#8a5a13]" />
                      </div>
                      <div>
                        <span className="block text-sm font-semibold text-[#15342d]">
                          {font.name}
                        </span>
                        {font.family_name && font.family_name !== font.name && (
                          <span className="block text-xs text-[#527267]">
                            Family: {font.family_name}
                            {font.variant ? ` · ${font.variant.replace(/_/g, " ")}` : ""}
                          </span>
                        )}
                        <span className="text-xs text-[#6b7f77]">
                          Upload must match this name exactly (.ttf, .otf, .woff, .woff2, .eot)
                        </span>
                      </div>
                    </div>
                    <div>
                      <input
                        ref={(el) => {
                          fileInputRefs.current[fontUploadKey(font)] = el;
                        }}
                        type="file"
                        accept=".ttf,.otf,.woff,.woff2,.eot"
                        onChange={(e) => handleFileInputChange(fontUploadKey(font), e)}
                        className="hidden"
                        id={`font-upload-${index}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRefs.current[fontUploadKey(font)]?.click()}
                        className="h-9 rounded-lg border-[#b7d9cc] px-4 text-sm font-medium text-[var(--primary-color,#007B55)] transition-all hover:border-[var(--primary-color,#007B55)] hover:bg-[rgba(0,123,85,0.06)]"
                      >
                        <Upload className="mr-1 h-4 w-4" />
                        Upload
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Uploaded Fonts */}
          {hasUploadedFonts && (
            <div className="rounded-lg border border-[#b8e2cc] bg-[#f1fbf5] p-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-[#0f6b3f]" />
                <h4 className="text-sm font-semibold text-[#0f6b3f]">
                  Uploaded Fonts ({uploadedFonts.length})
                </h4>
              </div>
              <div className="space-y-2">
                {uploadedFonts.map((font, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-[#d8ebdf] bg-white p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dcf7e8]">
                        <CheckCircle2 className="h-4 w-4 text-[#0f6b3f]" />
                      </div>
                      <span className="text-sm font-medium text-[#0f6b3f]">
                        {font.fontName}
                      </span>
                    </div>
                    <button
                      onClick={() => removeFont(font.fontName)}
                      className="p-2 rounded-full text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEE2E2] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        </section>
      </div>

      <aside className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <h3>Font Readiness</h3>
          <p>
            Resolve missing typefaces before slide previews, or continue with known
            risk if you accept imperfect typography.
          </p>
        </div>

        <div className={styles.summaryGrid}>
          <strong>
            Available fonts
            <span>{fontsData.available_fonts.length}</span>
          </strong>
          <strong>
            Missing fonts
            <span>{fontsNeedingUpload.length}</span>
          </strong>
          <strong>
            Uploaded now
            <span>{uploadedFonts.length}</span>
          </strong>
          <strong>
            Ready to preview
            <span>{allFontsUploaded ? "Yes" : "Partial"}</span>
          </strong>
        </div>

        {allFontsUploaded ? (
          <div className={styles.successNote}>All required fonts are ready for preview generation.</div>
        ) : (
          <div className={styles.warningNote}>
            You can continue without every font, but text rendering may differ from the
            source deck.
          </div>
        )}

        <div className={styles.toolbarActions}>
          <Button
            size="lg"
            onClick={onContinue}
            disabled={isUploading}
            className="h-10 rounded-lg bg-[var(--primary-color,#007B55)] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-dark,#006644)]"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {allFontsUploaded ? "Continue to Preview" : "Continue Anyway"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <div className={styles.infoNote}>
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Uploaded fonts are only used for this reconstruction flow and are mapped
              by exact name.
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default FontManager;
