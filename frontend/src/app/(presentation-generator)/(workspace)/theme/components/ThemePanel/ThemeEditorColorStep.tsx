'use client'

import React from 'react'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCcw } from 'lucide-react'
import { useI18n } from '@/shared/i18n'
import { ColorPickerComponent } from './ColorPickerComponent'
import { joinClassNames } from './themePanelHelpers'
import { ThemeColors } from './types'
import styles from './ThemePanel.module.css'

const GRAPH_COLOR_KEYS: Array<keyof ThemeColors> = [
  'graph_0',
  'graph_1',
  'graph_2',
  'graph_3',
  'graph_4',
  'graph_5',
  'graph_6',
  'graph_7',
  'graph_8',
  'graph_9',
]

interface ThemeEditorColorStepProps {
  customColors: ThemeColors
  showColorPicker: string | null
  onColorChange: (colorKey: keyof ThemeColors, value: string) => void
  onShowColorPicker: (colorKey: string | null) => void
  onGeneratePalette: () => Promise<void>
  isPaletteGenerating: boolean
  paletteDirty: boolean
  hasGeneratedPalette: boolean
}

function renderColorFields(
  fields: Array<{ key: keyof ThemeColors; label: string }>,
  customColors: ThemeColors,
  showColorPicker: string | null,
  onColorChange: (colorKey: keyof ThemeColors, value: string) => void,
  onShowColorPicker: (colorKey: string | null) => void
) {
  return fields.map(({ key, label }) => (
    <ColorPickerComponent
      key={key}
      colorKey={key}
      label={label}
      currentColor={customColors[key]}
      onColorChange={onColorChange}
      showColorPicker={showColorPicker}
      onShowColorPicker={onShowColorPicker}
    />
  ))
}

export const ThemeEditorColorStep: React.FC<ThemeEditorColorStepProps> = ({
  customColors,
  showColorPicker,
  onColorChange,
  onShowColorPicker,
  onGeneratePalette,
  isPaletteGenerating,
  paletteDirty,
  hasGeneratedPalette,
}) => {
  const { t } = useI18n()

  const brandColorFields: Array<{ key: keyof ThemeColors; label: string }> = [
    { key: 'primary', label: t('ppt_generator.theme.editor.colors.primary') },
    { key: 'background', label: t('ppt_generator.theme.editor.colors.background') },
  ]

  const textColorFields: Array<{ key: keyof ThemeColors; label: string }> = [
    { key: 'background_text', label: t('ppt_generator.theme.editor.colors.backgroundText') },
    { key: 'primary_text', label: t('ppt_generator.theme.editor.colors.primaryText') },
  ]

  return (
    <div className={styles.stepScrollable} style={{ paddingInline: '20px' }}>
      <Label className={styles.stepHeading}>
        {t('ppt_generator.theme.editor.colors.heading')}
      </Label>
      <div className="space-y-4">
        <div className={styles.stepCard}>
          <div className={styles.paletteActionRow}>
            <div className={styles.paletteActionCopy}>
              <p className={styles.stepSectionCaption}>{t('ppt_generator.theme.editor.colors.seedSection')}</p>
              <p className={styles.paletteHelperText}>{t('ppt_generator.theme.editor.colors.seedHint')}</p>
            </div>
            <button
              type="button"
              className={styles.inlineGenerateButton}
              onClick={() => void onGeneratePalette()}
              disabled={isPaletteGenerating}
            >
              {isPaletteGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              {isPaletteGenerating
                ? t('ppt_generator.theme.editor.colors.generating')
                : hasGeneratedPalette
                  ? t('ppt_generator.theme.editor.colors.regenerate')
                  : t('ppt_generator.theme.editor.colors.generate')}
            </button>
          </div>

          <div
            className={joinClassNames([
              styles.paletteSyncNotice,
              paletteDirty ? styles.paletteSyncDirty : styles.paletteSyncFresh,
            ])}
          >
            {paletteDirty
              ? t('ppt_generator.theme.editor.colors.syncDirty')
              : t('ppt_generator.theme.editor.colors.syncFresh')}
          </div>

          <div className="space-y-4">
            {renderColorFields(
              brandColorFields,
              customColors,
              showColorPicker,
              onColorChange,
              onShowColorPicker
            )}
          </div>
        </div>

        <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>{t('ppt_generator.theme.editor.colors.supportingSection')}</p>
          <div className="space-y-4">
            <div>
              <p className={styles.stepSectionCaption}>{t('ppt_generator.theme.editor.colors.textSection')}</p>
              <div className="space-y-4">
                {renderColorFields(
                  textColorFields,
                  customColors,
                  showColorPicker,
                  onColorChange,
                  onShowColorPicker
                )}
              </div>
            </div>

            <div>
              <p className={styles.stepSectionCaption}>{t('ppt_generator.theme.editor.colors.surfaceSection')}</p>
              <ColorPickerComponent
                colorKey="card"
                label={t('ppt_generator.theme.editor.colors.card')}
                currentColor={customColors.card}
                onColorChange={onColorChange}
                showColorPicker={showColorPicker}
                onShowColorPicker={onShowColorPicker}
              />
            </div>

            <div>
              <p className={styles.stepSectionCaption}>{t('ppt_generator.theme.editor.colors.chartSection')}</p>
              <div className="space-y-4">
              {GRAPH_COLOR_KEYS.map((colorKey, index) => (
                <ColorPickerComponent
                  key={colorKey}
                  colorKey={colorKey}
                  label={t('ppt_generator.theme.editor.colors.chartColor', { index: index + 1 })}
                  currentColor={customColors[colorKey]}
                  onColorChange={onColorChange}
                  showColorPicker={showColorPicker}
                  onShowColorPicker={onShowColorPicker}
                />
              ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

