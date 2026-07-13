'use client'

import React, { useMemo, useRef } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ChevronRight, SquarePen } from 'lucide-react'
import { Theme } from '@/app/(presentation-generator)/services/api/types'
import { useI18n } from '@/shared/i18n'
import { THEME_EDITOR_STEPS } from './constants'
import { StepIndicator } from './StepIndicator'
import { ThemeEditorBrandStep } from './ThemeEditorBrandStep'
import { ThemeEditorColorStep } from './ThemeEditorColorStep'
import { ThemeEditorFontStep } from './ThemeEditorFontStep'
import { ThemePreviewPane } from './ThemePreviewPane'
import type { ThemePreviewLayout } from './themePreviewLoader'
import { ThemeColors, ThemeEditorStepId, ThemeFonts, ThemeStepMeta, UserFontLibrary } from './types'
import styles from './ThemePanel.module.css'

interface ThemeEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTheme: Theme
  isNewTheme: boolean
  currentStep: ThemeEditorStepId
  currentStepIndex: number
  totalSteps: number
  currentStepMeta: ThemeStepMeta
  customColors: ThemeColors
  customFonts: ThemeFonts
  customBrandLogo: string | null
  isLogoUploading: boolean
  isFontUploading: boolean
  isPaletteGenerating: boolean
  paletteDirty: boolean
  hasGeneratedPalette: boolean
  showColorPicker: string | null
  themeCompanyName: string
  userFonts: UserFontLibrary
  totalThemeCount: number
  slideContainerRef: React.RefObject<HTMLDivElement>
  previewThemeStyle: React.CSSProperties
  previewScale: number
  previewSlideWidth: number
  previewSlideHeight: number
  previewLayouts: ThemePreviewLayout[]
  isPreviewLayoutsLoading: boolean
  onClickOutside: () => void
  onShowColorPicker: (colorKey: string | null) => void
  onColorChange: (colorKey: keyof ThemeColors, value: string) => void
  onGeneratePalette: () => Promise<void>
  onFontSelect: (fontName: string, url: string) => void
  onFontUpload: (fontFile: File) => Promise<void>
  onBrandLogoUpload: (file: File) => Promise<void>
  onThemeNameBlur: (themeName: string) => void
  onThemeCompanyNameBlur: (companyName: string) => void
  onRemoveLogo: () => void
  onPreviousStep: () => void
  onPrimaryAction: () => void
}

function getPrimaryActionLabel(
  currentStep: ThemeEditorStepId,
  t: ReturnType<typeof useI18n>['t']
) {
  if (currentStep === 'colors') return t('ppt_generator.theme.editor.primary.fonts')
  if (currentStep === 'fonts') return t('ppt_generator.theme.editor.primary.brand')
  return t('ppt_generator.theme.editor.primary.save')
}

export const ThemeEditorSheet: React.FC<ThemeEditorSheetProps> = ({
  open,
  onOpenChange,
  selectedTheme,
  isNewTheme,
  currentStep,
  currentStepIndex,
  totalSteps,
  currentStepMeta,
  customColors,
  customFonts,
  customBrandLogo,
  isLogoUploading,
  isFontUploading,
  isPaletteGenerating,
  paletteDirty,
  hasGeneratedPalette,
  showColorPicker,
  themeCompanyName,
  userFonts,
  totalThemeCount,
  slideContainerRef,
  previewThemeStyle,
  previewScale,
  previewSlideWidth,
  previewSlideHeight,
  previewLayouts,
  isPreviewLayoutsLoading,
  onClickOutside,
  onShowColorPicker,
  onColorChange,
  onGeneratePalette,
  onFontSelect,
  onFontUpload,
  onBrandLogoUpload,
  onThemeNameBlur,
  onThemeCompanyNameBlur,
  onRemoveLogo,
  onPreviousStep,
  onPrimaryAction,
}) => {
  const { t } = useI18n()
  const themeNameInputRef = useRef<HTMLInputElement>(null)
  const nextStepMeta = currentStepIndex < totalSteps - 1
    ? THEME_EDITOR_STEPS[currentStepIndex + 1]
    : null
  const editorEyebrow = useMemo(() => {
    if (isNewTheme) return t('ppt_generator.theme.editor.eyebrow.new')
    return selectedTheme.user === 'system'
      ? t('ppt_generator.theme.editor.eyebrow.customize')
      : t('ppt_generator.theme.editor.eyebrow.edit')
  }, [isNewTheme, selectedTheme.user, t])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={styles.sheetContent}>
        <div className={styles.editorShell}>
          <div onClick={onClickOutside} className={styles.editorPane}>
            <div className={styles.editorHeader}>
              <div className={styles.editorHeaderCopy}>
                <span className={styles.editorEyebrow}>{editorEyebrow}</span>
                <div className={styles.editorTitleRow}>
                  <input
                    ref={themeNameInputRef}
                    key={selectedTheme.id}
                    id="theme-name"
                    name="theme-name"
                    className={styles.editorTitleInput}
                    autoFocus={false}
                    defaultValue={selectedTheme.name}
                    onBlur={(event) => onThemeNameBlur(event.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.editorIconButton}
                    onClick={() => themeNameInputRef.current?.focus()}
                    aria-label={t('ppt_generator.theme.editor.editThemeName')}
                  >
                    <SquarePen className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.editorBody}>
              <StepIndicator currentStep={currentStep} />
              <div className={styles.stepStage}>
                <div className={styles.stepIntro}>
                  <div className={styles.stepIntroMeta}>
                    <span className={styles.stepCounter}>
                      {t('ppt_generator.theme.editor.stepCounter', {
                        current: currentStepIndex + 1,
                        total: totalSteps,
                      })}
                    </span>
                    {currentStep === 'brand' ? (
                      <span className={styles.stepOptionalBadge}>
                        {t('ppt_generator.theme.editor.optional')}
                      </span>
                    ) : null}
                  </div>
                  <h3 className={styles.stepIntroTitle}>{t(currentStepMeta.titleKey)}</h3>
                  <p className={styles.stepIntroText}>{t(currentStepMeta.descriptionKey)}</p>
                </div>

                <div className={styles.stepContent}>
                  {currentStep === 'colors' ? (
                    <ThemeEditorColorStep
                      customColors={customColors}
                      showColorPicker={showColorPicker}
                      onColorChange={onColorChange}
                      onShowColorPicker={onShowColorPicker}
                      onGeneratePalette={onGeneratePalette}
                      isPaletteGenerating={isPaletteGenerating}
                      paletteDirty={paletteDirty}
                      hasGeneratedPalette={hasGeneratedPalette}
                    />
                  ) : null}
                  {currentStep === 'fonts' ? (
                    <ThemeEditorFontStep
                      customFonts={customFonts}
                      userFonts={userFonts}
                      isFontUploading={isFontUploading}
                      onFontSelect={onFontSelect}
                      onFontUpload={onFontUpload}
                    />
                  ) : null}
                  {currentStep === 'brand' ? (
                    <ThemeEditorBrandStep
                      themeName={selectedTheme.name}
                      customColors={customColors}
                      customFonts={customFonts}
                      themeCompanyName={themeCompanyName}
                      customBrandLogo={customBrandLogo}
                      isLogoUploading={isLogoUploading}
                      onThemeCompanyNameBlur={onThemeCompanyNameBlur}
                      onBrandLogoUpload={onBrandLogoUpload}
                      onRemoveLogo={onRemoveLogo}
                    />
                  ) : null}
                </div>

                <div className={styles.editorFooter}>
                  <div className={styles.footerMeta}>
                    <span className={styles.footerStepCounter}>
                      {t('ppt_generator.theme.editor.stepCounter', {
                        current: currentStepIndex + 1,
                        total: totalSteps,
                      })}
                    </span>
                    <span className={styles.footerStepHint}>
                      {currentStep === 'brand'
                        ? t('ppt_generator.theme.editor.footer.final')
                        : t('ppt_generator.theme.editor.footer.next', {
                            step: nextStepMeta ? t(nextStepMeta.labelKey) : '',
                          })}
                    </span>
                  </div>
                  <div className={styles.footerActions}>
                    {currentStepIndex > 0 ? (
                      <button
                        type="button"
                        className={styles.footerSecondaryAction}
                        onClick={onPreviousStep}
                      >
                        {t('ppt_generator.theme.editor.back')}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className={styles.footerPrimaryAction}
                      onClick={onPrimaryAction}
                    >
                      {getPrimaryActionLabel(currentStep, t)}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <ThemePreviewPane
            slideContainerRef={slideContainerRef}
            previewThemeStyle={previewThemeStyle}
            previewScale={previewScale}
            previewSlideWidth={previewSlideWidth}
            previewSlideHeight={previewSlideHeight}
            totalThemeCount={totalThemeCount}
            previewLayouts={previewLayouts}
            isLoading={isPreviewLayoutsLoading}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
