'use client'

import React, { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'
import { useI18n } from '@/shared/i18n'
import { joinClassNames } from './themePanelHelpers'
import type { ThemeColors, ThemeFonts } from './types'
import styles from './ThemePanel.module.css'

interface ThemeEditorBrandStepProps {
  themeName: string
  customColors: ThemeColors
  customFonts: ThemeFonts
  themeCompanyName: string
  customBrandLogo: string | null
  isLogoUploading: boolean
  onThemeCompanyNameBlur: (companyName: string) => void
  onBrandLogoUpload: (file: File) => Promise<void>
  onRemoveLogo: () => void
}

export const ThemeEditorBrandStep: React.FC<ThemeEditorBrandStepProps> = ({
  themeName,
  customColors,
  customFonts,
  themeCompanyName,
  customBrandLogo,
  isLogoUploading,
  onThemeCompanyNameBlur,
  onBrandLogoUpload,
  onRemoveLogo,
}) => {
  const { t } = useI18n()
  const logoUploadRef = useRef<HTMLInputElement>(null)

  return (
    <div className={joinClassNames([styles.stepScrollable, styles.stepStack, styles.logoStep])}>
      <Label className={styles.stepHeading}>{t('ppt_generator.theme.editor.brand.heading')}</Label>
      <div className={styles.brandSummaryCard}>
        <div className={styles.brandSummaryHeader}>
          <p className={styles.stepSectionCaption}>{t('ppt_generator.theme.editor.brand.summary.caption')}</p>
          <p className={styles.brandSummaryText}>{t('ppt_generator.theme.editor.brand.summary.body')}</p>
        </div>
        <div className={styles.brandSummaryGrid}>
          <div className={styles.brandSummaryItem}>
            <span className={styles.brandSummaryLabel}>{t('ppt_generator.theme.editor.brand.summary.themeName')}</span>
            <span className={styles.brandSummaryValue}>{themeName}</span>
          </div>
          <div className={styles.brandSummaryItem}>
            <span className={styles.brandSummaryLabel}>{t('ppt_generator.theme.editor.brand.summary.primary')}</span>
            <span className={styles.brandSummaryColorValue}>
              <span
                className={styles.brandSummarySwatch}
                style={{ backgroundColor: customColors.primary }}
                aria-hidden="true"
              />
              {customColors.primary}
            </span>
          </div>
          <div className={styles.brandSummaryItem}>
            <span className={styles.brandSummaryLabel}>{t('ppt_generator.theme.editor.brand.summary.background')}</span>
            <span className={styles.brandSummaryColorValue}>
              <span
                className={styles.brandSummarySwatch}
                style={{ backgroundColor: customColors.background }}
                aria-hidden="true"
              />
              {customColors.background}
            </span>
          </div>
          <div className={styles.brandSummaryItem}>
            <span className={styles.brandSummaryLabel}>{t('ppt_generator.theme.editor.brand.summary.font')}</span>
            <span className={styles.brandSummaryValue}>{customFonts.textFont.name}</span>
          </div>
          <div className={styles.brandSummaryItem}>
            <span className={styles.brandSummaryLabel}>{t('ppt_generator.theme.editor.brand.summary.logo')}</span>
            <span className={styles.brandSummaryValue}>
              {customBrandLogo
                ? t('ppt_generator.theme.editor.brand.summary.logoReady')
                : t('ppt_generator.theme.editor.brand.summary.logoOptional')}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.stepCard}>
        <Label className={styles.stepFieldLabel}>{t('ppt_generator.theme.editor.brand.companyName')}</Label>
        <Input
          defaultValue={themeCompanyName}
          placeholder={t('ppt_generator.theme.editor.brand.companyPlaceholder')}
          onBlur={(event) => onThemeCompanyNameBlur(event.target.value)}
        />
      </div>
      <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
        <Label className={styles.stepFieldLabel}>{t('ppt_generator.theme.editor.brand.logo')}</Label>

        <div
          className="space-y-2 bg-[#F6F6F9] rounded-md p-1 cursor-pointer"
          onClick={(event) => {
            event.stopPropagation()
            logoUploadRef.current?.click()
          }}
          role="button"
          tabIndex={0}
        >
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            {isLogoUploading ? (
              <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <p className="text-sm">{t('ppt_generator.theme.editor.brand.uploading')}</p>
              </div>
            ) : customBrandLogo ? (
              <div className="space-y-2">
                <img
                  src={customBrandLogo}
                  alt={t('ppt_generator.theme.editor.brand.logoPreviewAlt')}
                  className="mx-auto h-16 w-auto object-contain"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveLogo()
                  }}
                >
                  {t('ppt_generator.theme.editor.brand.removeLogo')}
                </Button>
              </div>
            ) : (
              <>
                <div className="w-[42px] h-[42px] mx-auto flex justify-center items-center rounded-full bg-[#EBE9FE]">
                  <div className="w-[22px] h-[22px] rounded-full bg-[#7A5AF8] flex items-center justify-center text-white">
                    <Plus className="w-3 h-3" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-blue-600 hover:text-blue-500">{t('ppt_generator.theme.editor.brand.clickUpload')}</span>
                  <span className="text-gray-500"> {t('ppt_generator.theme.editor.brand.dragDrop')}</span>
                </div>
              </>
            )}

            <input
              ref={logoUploadRef}
              type="file"
              accept="image/png, image/jpeg, image/jpg"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                if (file) {
                  await onBrandLogoUpload(file)
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

