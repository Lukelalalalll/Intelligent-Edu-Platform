import React from 'react'
import { useI18n } from '@/shared/i18n'
import { THEME_EDITOR_STEPS } from './constants'
import type { ThemeEditorStepId } from './types'

interface StepIndicatorProps {
  currentStep: ThemeEditorStepId
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const { t } = useI18n()
  const currentStepIndex = THEME_EDITOR_STEPS.findIndex((step) => step.id === currentStep)

  return (
    <div className="flex flex-col items-center gap-7 px-4 min-w-[104px] pt-8 border-r border-[#EDEEEF]">
      {THEME_EDITOR_STEPS.map(({ id, labelKey }, index) => {
      const stepNumber = index + 1
      const isActive = currentStep === id
      const isCompleted = index < currentStepIndex
      return (
        <div key={id} className="flex flex-col items-center gap-1.5 px-3">
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${isActive
              ? 'bg-[#7A5AF8] text-white'
              : isCompleted
                ? 'bg-[#EDE9FE] text-[#5B44D3] border border-[#D6CCFF]'
                : 'bg-white text-[#404348] border border-[#EDEEEF]'
              }`}
          >
            {t('ppt_generator.theme.editor.steps.stepLabel', { step: stepNumber })}
          </span>
          <span className="text-[11px] font-normal text-black">{t(labelKey)}</span>
        </div>
      )
      })}
    </div>
  )
}

