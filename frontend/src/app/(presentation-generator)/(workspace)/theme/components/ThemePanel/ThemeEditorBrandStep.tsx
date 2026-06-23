'use client'

import React, { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus } from 'lucide-react'
import { joinClassNames } from './themePanelHelpers'
import styles from './ThemePanel.module.css'

interface ThemeEditorBrandStepProps {
  themeCompanyName: string
  customBrandLogo: string | null
  isLogoUploading: boolean
  onThemeCompanyNameBlur: (companyName: string) => void
  onBrandLogoUpload: (file: File) => Promise<void>
  onRemoveLogo: () => void
}

export const ThemeEditorBrandStep: React.FC<ThemeEditorBrandStepProps> = ({
  themeCompanyName,
  customBrandLogo,
  isLogoUploading,
  onThemeCompanyNameBlur,
  onBrandLogoUpload,
  onRemoveLogo,
}) => {
  const logoUploadRef = useRef<HTMLInputElement>(null)

  return (
    <div className={joinClassNames([styles.stepScrollable, styles.stepStack, styles.logoStep])}>
      <Label className={styles.stepHeading}>Logo</Label>
      <div className={styles.stepCard}>
        <Label className={styles.stepFieldLabel}>Company Name</Label>
        <Input
          defaultValue={themeCompanyName}
          placeholder="Enter company name"
          onBlur={(event) => onThemeCompanyNameBlur(event.target.value)}
        />
      </div>
      <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
        <Label className={styles.stepFieldLabel}>Brand Logo</Label>

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
                <p className="text-sm">Uploading logo...</p>
              </div>
            ) : customBrandLogo ? (
              <div className="space-y-2">
                <img
                  src={customBrandLogo}
                  alt="Brand Logo"
                  className="mx-auto h-16 w-auto object-contain"
                />
                <Button variant="outline" size="sm" onClick={onRemoveLogo}>
                  Remove Logo
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
                  <span className="text-blue-600 hover:text-blue-500">Click to upload</span>
                  <span className="text-gray-500"> or drag and drop</span>
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
