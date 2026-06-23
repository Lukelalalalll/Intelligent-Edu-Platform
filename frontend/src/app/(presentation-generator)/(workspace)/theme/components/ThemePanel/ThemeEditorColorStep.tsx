'use client'

import React from 'react'
import { Label } from '@/components/ui/label'
import { RefreshCcw } from 'lucide-react'
import { ColorPickerComponent } from './ColorPickerComponent'
import { joinClassNames } from './themePanelHelpers'
import { ThemeColors } from './types'
import styles from './ThemePanel.module.css'

const BRAND_COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: 'primary', label: 'Primary Color' },
  { key: 'background', label: 'Background Color' },
]

const TEXT_COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string }> = [
  { key: 'background_text', label: 'Background Text' },
  { key: 'primary_text', label: 'Primary Text' },
]

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
  step: 1 | 2
  customColors: ThemeColors
  showColorPicker: string | null
  onColorChange: (colorKey: keyof ThemeColors, value: string) => void
  onShowColorPicker: (colorKey: string | null) => void
  onRefreshTheme: (options: { primary?: string; background?: string }) => Promise<void>
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
  step,
  customColors,
  showColorPicker,
  onColorChange,
  onShowColorPicker,
  onRefreshTheme,
}) => (
  <div
    className={styles.stepScrollable}
    style={{
      paddingInline: step === 1 ? '20px' : '10px',
    }}
  >
    <Label className={styles.stepHeading}>
      {step === 1 ? 'Brand Colors' : 'Palette'}
      <RefreshCcw
        onClick={() =>
          void onRefreshTheme(
            step === 1
              ? {}
              : {
                  primary: customColors.primary,
                  background: customColors.background,
                }
          )
        }
        className={styles.stepRefresh}
      />
    </Label>
    <div className="space-y-4">
      <div className={joinClassNames([styles.stepCard, step === 2 && styles.stepCardMuted])}>
        {step === 2 ? <p className={styles.stepSectionCaption}>Brand Colors</p> : null}
        <div
          className="space-y-4"
          style={{
            padding: step === 2 ? '10px' : '0px',
            backgroundColor: 'transparent',
          }}
        >
          {renderColorFields(
            BRAND_COLOR_FIELDS,
            customColors,
            showColorPicker,
            onColorChange,
            onShowColorPicker
          )}
        </div>
      </div>

      {step === 2 ? (
        <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>Text Colors</p>
          <div
            className="space-y-4"
            style={{
              padding: '10px',
              backgroundColor: 'transparent',
            }}
          >
            {renderColorFields(
              TEXT_COLOR_FIELDS,
              customColors,
              showColorPicker,
              onColorChange,
              onShowColorPicker
            )}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={styles.stepCard}>
          <ColorPickerComponent
            colorKey="card"
            label="Card Color"
            currentColor={customColors.card}
            onColorChange={onColorChange}
            showColorPicker={showColorPicker}
            onShowColorPicker={onShowColorPicker}
          />
        </div>
      ) : null}

      {step === 2 ? (
        <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>Graph/Chart Colors</p>
          <div
            className="space-y-4"
            style={{
              padding: '10px',
              backgroundColor: 'transparent',
            }}
          >
            {GRAPH_COLOR_KEYS.map((colorKey) => (
              <ColorPickerComponent
                key={colorKey}
                colorKey={colorKey}
                label=""
                currentColor={customColors[colorKey]}
                onColorChange={onColorChange}
                showColorPicker={showColorPicker}
                onShowColorPicker={onShowColorPicker}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  </div>
)
