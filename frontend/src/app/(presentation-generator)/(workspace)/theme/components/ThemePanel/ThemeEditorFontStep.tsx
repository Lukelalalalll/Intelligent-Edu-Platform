'use client'

import React, { useRef } from 'react'
import { Label } from '@/components/ui/label'
import { ChevronRight, Loader2, Plus } from 'lucide-react'
import { FontCard } from './FontCard'
import { FONT_OPTIONS } from './constants'
import { joinClassNames } from './themePanelHelpers'
import { ThemeFonts, UserFontLibrary } from './types'
import styles from './ThemePanel.module.css'

interface ThemeEditorFontStepProps {
  customFonts: ThemeFonts
  userFonts: UserFontLibrary
  isFontUploading: boolean
  onFontSelect: (fontName: string, url: string) => void
  onFontUpload: (fontFile: File) => Promise<void>
}

export const ThemeEditorFontStep: React.FC<ThemeEditorFontStepProps> = ({
  customFonts,
  userFonts,
  isFontUploading,
  onFontSelect,
  onFontUpload,
}) => {
  const fontUploadRef = useRef<HTMLInputElement>(null)

  return (
    <div
      className={joinClassNames([styles.stepScrollable, styles.stepStack])}
      style={{
        paddingInline: '10px',
      }}
    >
      <Label className={joinClassNames([styles.stepHeading, styles.stepHeadingInset])}>
        Typography
      </Label>

      <div className={styles.stepCard}>
        <p className={styles.stepSectionCaption}>Upload Custom Font</p>
        <div
          className={`p-3 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer group ${
            isFontUploading
              ? 'bg-[#F8F7FF] border-[#7A5AF8]'
              : 'bg-[#F9FAFB] border-[#E0E0E0] '
          }`}
          onClick={() => {
            if (!isFontUploading) {
              fontUploadRef.current?.click()
            }
          }}
          role="button"
          tabIndex={0}
        >
          {isFontUploading ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#EBE9FE] flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-[#7A5AF8] animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#7A5AF8]">Uploading font...</p>
                <p className="text-xs text-[#888]">Please wait</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#EBE9FE] flex items-center justify-center group-hover:bg-[#DDD8FD] transition-colors">
                <Plus className="w-5 h-5 text-[#7A5AF8]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#151515]">Upload Font File</p>
                <p className="text-xs text-[#888]">.ttf, .otf, .woff, .woff2</p>
              </div>
              <ChevronRight className="w-4 h-4 text-[#999] group-hover:text-[#7A5AF8] transition-colors" />
            </div>
          )}
        </div>
        <input
          ref={fontUploadRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2,.eot"
          className="w-full h-full hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (file) {
              await onFontUpload(file)
            }
          }}
        />
      </div>

      {userFonts.fonts.length > 0 ? (
        <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>Your Uploaded Fonts</p>
          <div className="grid grid-cols-2 gap-2">
            {userFonts.fonts.map((font) => (
              <FontCard
                key={font.name}
                font={{
                  name: font.name,
                  displayName: font.name,
                }}
                isSelected={customFonts.textFont.name === font.name}
                onSelect={() => onFontSelect(font.name, font.url)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
        <p className={styles.stepSectionCaption}>Pre-Sets</p>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto custom_scrollbar">
          {FONT_OPTIONS.map((font) => (
            <FontCard
              key={font.name}
              font={font}
              isSelected={customFonts.textFont.name === font.name}
              onSelect={() => onFontSelect(font.name, font.cssUrl)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
