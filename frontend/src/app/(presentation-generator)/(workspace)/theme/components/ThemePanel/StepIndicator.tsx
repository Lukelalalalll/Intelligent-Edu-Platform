import React from 'react'
import { useI18n } from '@/shared/i18n'
import { THEME_EDITOR_STEPS } from './constants'

interface StepIndicatorProps {
  currentStep: number
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const { t } = useI18n()

  return (
    <div className="flex flex-col items-center gap-7 px-4 min-w-[104px] pt-8 border-r border-[#EDEEEF]">
      {THEME_EDITOR_STEPS.map(({ step, labelKey }) => {
      const isActive = currentStep === step
      return (
        <div key={step} className="flex flex-col items-center gap-1.5 px-3  ">
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${isActive
              ? 'bg-[#7A5AF8] text-white'
              : 'bg-white text-[#404348] border border-[#EDEEEF]'
              }`}
          >
            {t('presenton.theme.editor.steps.stepLabel', { step })}
          </span>
          <span className="text-[11px] font-normal text-black">{t(labelKey)}</span>
        </div>
      )
      })}
    </div>
  )
}
