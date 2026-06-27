'use client'

import React, { useMemo, useRef } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ChevronRight, SquarePen } from 'lucide-react'
import { Theme } from '@/app/(presentation-generator)/services/api/types'
import { useI18n } from '@/shared/i18n'
import { StepIndicator } from './StepIndicator'
import { ThemeEditorBrandStep } from './ThemeEditorBrandStep'
import { ThemeEditorColorStep } from './ThemeEditorColorStep'
import { ThemeEditorFontStep } from './ThemeEditorFontStep'
import { ThemePreviewPane } from './ThemePreviewPane'
import type { ThemePreviewLayout } from './themePreviewLoader'
import { ThemeColors, ThemeFonts, ThemeStepMeta, UserFontLibrary } from './types'
import styles from './ThemePanel.module.css'

interface ThemeEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTheme: Theme
  isNewTheme: boolean
  currentStep: number
  currentStepMeta: ThemeStepMeta
  customColors: ThemeColors
  customFonts: ThemeFonts
  customBrandLogo: string | null
  isLogoUploading: boolean
  isFontUploading: boolean
  showColorPicker: string | null
  themeCompanyName: string
  userFonts: UserFontLibrary
  totalThemeCount: number
  slideContainerRef: React.RefObject<HTMLDivElement>
  previewScale: number
  previewSlideWidth: number
  previewSlideHeight: number
  previewLayouts: ThemePreviewLayout[]
  isPreviewLayoutsLoading: boolean
  onClickOutside: () => void
  onShowColorPicker: (colorKey: string | null) => void
  onColorChange: (colorKey: keyof ThemeColors, value: string) => void
  onRefreshTheme: (options: { primary?: string; background?: string }) => Promise<void>
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
  currentStep: number,
  t: ReturnType<typeof useI18n>['t']
) {
  if (currentStep === 1) return t('presenton.theme.editor.primary.generate')
  if (currentStep === 2) return t('presenton.theme.editor.primary.fonts')
  if (currentStep === 3) return t('presenton.theme.editor.primary.design')
  return t('presenton.theme.editor.primary.save')
}

export const ThemeEditorSheet: React.FC<ThemeEditorSheetProps> = ({
  open,
  onOpenChange,
  selectedTheme,
  isNewTheme,
  currentStep,
  currentStepMeta,
  customColors,
  customFonts,
  customBrandLogo,
  isLogoUploading,
  isFontUploading,
  showColorPicker,
  themeCompanyName,
  userFonts,
  totalThemeCount,
  slideContainerRef,
  previewScale,
  previewSlideWidth,
  previewSlideHeight,
  previewLayouts,
  isPreviewLayoutsLoading,
  onClickOutside,
  onShowColorPicker,
  onColorChange,
  onRefreshTheme,
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
  const editorEyebrow = useMemo(() => {
    if (isNewTheme) return t('presenton.theme.editor.eyebrow.new')
    return selectedTheme.user === 'system'
      ? t('presenton.theme.editor.eyebrow.customize')
      : t('presenton.theme.editor.eyebrow.edit')
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
                    aria-label={t('presenton.theme.editor.editThemeName')}
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
                  <h3 className={styles.stepIntroTitle}>{t(currentStepMeta.titleKey)}</h3>
                  <p className={styles.stepIntroText}>{t(currentStepMeta.descriptionKey)}</p>
                </div>

                <div className={styles.stepContent}>
                  {currentStep === 1 ? (
                    <ThemeEditorColorStep
                      step={1}
                      customColors={customColors}
                      showColorPicker={showColorPicker}
                      onColorChange={onColorChange}
                      onShowColorPicker={onShowColorPicker}
                      onRefreshTheme={onRefreshTheme}
                    />
                  ) : null}
                  {currentStep === 2 ? (
                    <ThemeEditorColorStep
                      step={2}
                      customColors={customColors}
                      showColorPicker={showColorPicker}
                      onColorChange={onColorChange}
                      onShowColorPicker={onShowColorPicker}
                      onRefreshTheme={onRefreshTheme}
                    />
                  ) : null}
                  {currentStep === 3 ? (
                    <ThemeEditorFontStep
                      customFonts={customFonts}
                      userFonts={userFonts}
                      isFontUploading={isFontUploading}
                      onFontSelect={onFontSelect}
                      onFontUpload={onFontUpload}
                    />
                  ) : null}
                  {currentStep === 4 ? (
                    <ThemeEditorBrandStep
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
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      className={styles.footerSecondaryAction}
                      onClick={onPreviousStep}
                    >
                      {t('presenton.theme.editor.back')}
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

          <ThemePreviewPane
            slideContainerRef={slideContainerRef}
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
