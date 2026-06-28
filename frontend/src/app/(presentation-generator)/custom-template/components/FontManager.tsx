import React, { useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileType,
  Info,
  Loader2,
  RefreshCcw,
  Type,
  Upload,
  X,
} from "lucide-react";

import {
  FontItem,
  FontManagerProps,
  fontFamilyName,
  fontResolutionKey,
  fontVariantName,
  matchedFontOptionValue,
} from "../types";
import styles from "../customTemplateWorkbench.module.css";

const fontUploadKey = (font: FontItem) => fontResolutionKey(font);

const variantLabel = (variant?: string | null) =>
  (variant || "regular").replace(/_/g, " ");

const FontManager: React.FC<FontManagerProps> = ({
  fontsData,
  fontResolutionsByKey,
  uploadedFonts,
  uploadFont,
  removeFont,
  setFontReplacement,
  allFontsResolved,
  onContinue,
  isUploading = false,
}) => {
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const hasAvailableFonts = fontsData.available_fonts.length > 0;
  const hasUploadedFonts = uploadedFonts.length > 0;
  const uploadCount = uploadedFonts.length;
  const replacementCount = Object.values(fontResolutionsByKey).filter(
    (resolution) => resolution?.type === "replacement"
  ).length;
  const unresolvedCount =
    fontsData.unavailable_fonts.length - uploadCount - replacementCount;

  const availableOptionLookup = useMemo(
    () =>
      new Map(
        fontsData.available_fonts.map((font) => [matchedFontOptionValue(font), font])
      ),
    [fontsData.available_fonts]
  );

  const sortedMatchedFontsForMissingFont = (missingFont: FontItem) => {
    const missingVariant = fontVariantName(missingFont);
    const dedupedOptions = new Map<string, FontItem>();

    fontsData.available_fonts.forEach((font) => {
      dedupedOptions.set(matchedFontOptionValue(font), font);
    });

    return Array.from(dedupedOptions.values()).sort((left, right) => {
      const leftVariantMatch = fontVariantName(left) === missingVariant ? 0 : 1;
      const rightVariantMatch = fontVariantName(right) === missingVariant ? 0 : 1;
      if (leftVariantMatch !== rightVariantMatch) {
        return leftVariantMatch - rightVariantMatch;
      }

      const leftName = `${fontFamilyName(left)} ${left.name}`.toLowerCase();
      const rightName = `${fontFamilyName(right)} ${right.name}`.toLowerCase();
      return leftName.localeCompare(rightName);
    });
  };

  const handleFontUpload = (font: FontItem, file: File) => {
    if (!file) return;

    const result = uploadFont(font, file);

    if (result && fileInputRefs.current[result]) {
      fileInputRefs.current[result]!.value = "";
    }
  };

  const handleFileInputChange = (
    font: FontItem,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFontUpload(font, file);
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
              <h2 className="text-xl font-semibold text-[#15342d]">
                Font Management
              </h2>
              <p className="mt-0.5 text-sm text-[#527267]">
                {allFontsResolved
                  ? "Every missing font entry is resolved. You can proceed to preview."
                  : "Resolve each missing font with either a matched font selection or an uploaded font file before preview generation."}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {hasAvailableFonts ? (
              <div className="rounded-lg border border-[#b8e2cc] bg-[#f1fbf5] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[#0f6b3f]" />
                  <h4 className="text-sm font-semibold text-[#0f6b3f]">
                    Matched Fonts ({fontsData.available_fonts.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {fontsData.available_fonts.map((font, index) => (
                    <span
                      key={`${matchedFontOptionValue(font)}-${index}`}
                      className="rounded-full border border-[#d8ebdf] bg-white px-3 py-1.5 text-xs font-medium text-[#0f6b3f]"
                    >
                      {font.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {fontsData.unavailable_fonts.length > 0 ? (
              <div className="rounded-lg border border-[#f2d58d] bg-[#fff8eb] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-[#8a5a13]" />
                  <h4 className="text-sm font-semibold text-[#8a5a13]">
                    Missing Fonts ({fontsData.unavailable_fonts.length})
                  </h4>
                </div>

                <div className="space-y-3">
                  {fontsData.unavailable_fonts.map((font, index) => {
                    const resolutionKey = fontResolutionKey(font);
                    const resolution = fontResolutionsByKey[resolutionKey];
                    const selectedReplacement =
                      resolution?.type === "replacement" ? resolution.selection : null;
                    const currentUpload = uploadedFonts.find(
                      (uploadedFont) => uploadedFont.resolutionKey === resolutionKey
                    );
                    const matchedOptions = sortedMatchedFontsForMissingFont(font);

                    return (
                      <div
                        key={resolutionKey}
                        className="rounded-lg border border-[#f2d58d] bg-white p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#fff2cf]">
                              <FileType className="h-5 w-5 text-[#8a5a13]" />
                            </div>
                            <div className="space-y-2">
                              <span className="block text-sm font-semibold text-[#15342d]">
                                {font.name}
                              </span>
                              <div className="flex flex-wrap gap-2 text-xs">
                                {font.family_name && font.family_name !== font.name ? (
                                  <span className="rounded-full bg-[#f7faf8] px-2 py-1 text-[#527267]">
                                    Family: {font.family_name}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-[#f7faf8] px-2 py-1 text-[#527267]">
                                  Variant: {variantLabel(font.variant)}
                                </span>
                                {resolution?.type === "upload" ? (
                                  <span className="rounded-full bg-[#dcf7e8] px-2 py-1 font-medium text-[#0f6b3f]">
                                    Resolved by upload
                                  </span>
                                ) : null}
                                {resolution?.type === "replacement" ? (
                                  <span className="rounded-full bg-[#e8f1ff] px-2 py-1 font-medium text-[#2456a6]">
                                    Matched to {selectedReplacement?.replacement_label}
                                  </span>
                                ) : null}
                                {!resolution ? (
                                  <span className="rounded-full bg-[#fff2cf] px-2 py-1 font-medium text-[#8a5a13]">
                                    Unresolved
                                  </span>
                                ) : null}
                              </div>
                              <span className="block text-xs text-[#6b7f77]">
                                Choose a matched font or upload a font file for this
                                exact entry.
                              </span>
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-3 lg:max-w-[360px]">
                            <div className="space-y-2">
                              <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#6b7f77]">
                                Matched font
                              </span>
                              <Select
                                value={
                                  selectedReplacement
                                    ? `${selectedReplacement.replacement_family_name}::${selectedReplacement.replacement_variant}`
                                    : ""
                                }
                                onValueChange={(value) => {
                                  const matchedFont =
                                    availableOptionLookup.get(value) || null;
                                  setFontReplacement(font, matchedFont);
                                }}
                              >
                                <SelectTrigger className="h-10 rounded-lg border-[#d9e6df] bg-white text-left">
                                  <SelectValue placeholder="Choose a matched font" />
                                </SelectTrigger>
                                <SelectContent>
                                  {matchedOptions.map((option) => (
                                    <SelectItem
                                      key={matchedFontOptionValue(option)}
                                      value={matchedFontOptionValue(option)}
                                    >
                                      {option.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[fontUploadKey(font)] = el;
                                }}
                                type="file"
                                accept=".ttf,.otf,.woff,.woff2,.eot"
                                onChange={(event) => handleFileInputChange(font, event)}
                                className="hidden"
                                id={`font-upload-${index}`}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  fileInputRefs.current[fontUploadKey(font)]?.click()
                                }
                                className="h-9 rounded-lg border-[#b7d9cc] px-4 text-sm font-medium text-[var(--primary-color,#007B55)] transition-all hover:border-[var(--primary-color,#007B55)] hover:bg-[rgba(0,123,85,0.06)]"
                              >
                                <Upload className="mr-1 h-4 w-4" />
                                Upload font file
                              </Button>
                              {selectedReplacement ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setFontReplacement(font, null)}
                                  className="h-9 rounded-lg px-3 text-sm text-[#6b7f77] hover:bg-[#f3f6f4] hover:text-[#15342d]"
                                >
                                  <RefreshCcw className="mr-1 h-4 w-4" />
                                  Clear match
                                </Button>
                              ) : null}
                            </div>

                            {currentUpload ? (
                              <div className="rounded-lg border border-[#d8ebdf] bg-[#f6fbf8] px-3 py-2 text-xs text-[#0f6b3f]">
                                Uploaded file: {currentUpload.file.name}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {hasUploadedFonts ? (
              <div className="rounded-lg border border-[#b8e2cc] bg-[#f1fbf5] p-4">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[#0f6b3f]" />
                  <h4 className="text-sm font-semibold text-[#0f6b3f]">
                    Uploaded Fonts ({uploadedFonts.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {uploadedFonts.map((font) => (
                    <div
                      key={font.resolutionKey}
                      className="flex items-center justify-between rounded-lg border border-[#d8ebdf] bg-white p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dcf7e8]">
                          <CheckCircle2 className="h-4 w-4 text-[#0f6b3f]" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-[#0f6b3f]">
                            {font.sourceFontName}
                          </span>
                          <span className="text-xs text-[#527267]">
                            {font.file.name}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFont(font.resolutionKey)}
                        className="rounded-full p-2 text-[#6B7280] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <aside className={styles.summaryCard}>
        <div className={styles.summaryHeader}>
          <h3>Font Readiness</h3>
          <p>
            Resolve missing typefaces before slide previews so the reconstructed
            slides stay close to the original deck.
          </p>
        </div>

        <div className={styles.summaryGrid}>
          <strong>
            Matched fonts
            <span>{fontsData.available_fonts.length}</span>
          </strong>
          <strong>
            Resolved by upload
            <span>{uploadCount}</span>
          </strong>
          <strong>
            Resolved by replacement
            <span>{replacementCount}</span>
          </strong>
          <strong>
            Unresolved
            <span>{unresolvedCount}</span>
          </strong>
        </div>

        {allFontsResolved ? (
          <div className={styles.successNote}>
            All missing font entries are resolved and ready for preview
            generation.
          </div>
        ) : (
          <div className={styles.warningNote}>
            Resolve every missing entry with either an uploaded font file or a
            matched font selection before previews can be generated.
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#D8E4DE] bg-white/70 px-3 py-3 text-xs text-[#527267]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0f6b3f]" />
          <p>
            Uploads and matched selections only affect this reconstruction
            session. They do not change the saved PPTX source outside this flow.
          </p>
        </div>

        <div className={styles.toolbarActions}>
          <Button
            size="lg"
            onClick={onContinue}
            disabled={isUploading || !allFontsResolved}
            className="h-10 rounded-lg bg-[var(--primary-color,#007B55)] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[var(--primary-dark,#006644)]"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {allFontsResolved
                  ? "Continue to Preview"
                  : "Resolve All Missing Fonts First"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        <div className={styles.infoNote}>
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Replacement selections reuse matched fonts already available to
              PPT Generator. Uploads remain the highest-fidelity option when you
              have the real font file.
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default FontManager;

