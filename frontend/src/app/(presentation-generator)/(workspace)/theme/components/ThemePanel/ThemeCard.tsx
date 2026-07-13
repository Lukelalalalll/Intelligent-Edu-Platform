"use client";

import React, { useState } from 'react'
import { AlertTriangle, Check, Copy, Trash } from 'lucide-react'
import { Theme } from '@/app/(presentation-generator)/services/api/types'
import ToolTip from '@/components/ToolTip'
import { useI18n } from '@/shared/i18n'
import styles from './ThemeCard.module.css'

interface ThemeCardProps {
  theme: Theme
  onSelect: (theme: Theme) => void
  onDelete: (themeId: string) => void
  showDeleteButton?: boolean
}

function joinClassNames(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export const ThemeCard: React.FC<ThemeCardProps> = ({ theme, onSelect, onDelete, showDeleteButton = true }) => {
  const { t } = useI18n()
  if (!theme.data.colors['graph_0']) return null

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [copied, setCopied] = useState(false)

  return (
    <div className={styles.card} onClick={() => onSelect(theme)}>
      {showDeleteButton ? (
        <button
          type="button"
          className={styles.deleteButton}
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteDialog(true)
          }}
          aria-label={t('ppt_generator.theme.card.deleteAria', { name: theme.name })}
        >
          <Trash className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {showDeleteDialog ? (
        <div
          className={styles.dialogBackdrop}
          onClick={(e) => {
            e.stopPropagation()
            setShowDeleteDialog(false)
          }}
        >
          <div className={styles.dialogCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogBody}>
              <div className={styles.dialogIcon}>
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className={styles.dialogTitle}>{t('ppt_generator.theme.card.deleteTitle')}</h3>
              <p className={styles.dialogText}>
                {t('ppt_generator.theme.card.deleteBody', { name: theme.name })}
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className={styles.dialogAction}
              >
                {t('ppt_generator.theme.card.deleteCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(theme.id)
                  setShowDeleteDialog(false)
                }}
                className={joinClassNames([styles.dialogAction, styles.dialogActionDanger])}
              >
                {t('ppt_generator.theme.card.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.previewShell}>
        <img src="/card_bg.svg" alt="" className={styles.previewBackground} />

        <div className={styles.metaRow}>
          <ToolTip content={t('ppt_generator.theme.card.tooltip.font')}>
            <span className={styles.metaChip}>{theme.data.fonts.textFont.name}</span>
          </ToolTip>

          {theme.company_name ? (
            <ToolTip content={t('ppt_generator.theme.card.tooltip.company')}>
              <span className={styles.metaChip}>{theme.company_name}</span>
            </ToolTip>
          ) : null}

          {theme.logo_url ? (
            <ToolTip content={t('ppt_generator.theme.card.tooltip.logo')}>
              <span className={joinClassNames([styles.metaChip, styles.logoChip])}>
                <img src={theme.logo_url} alt={theme.name} className={styles.logoImage} />
              </span>
            </ToolTip>
          ) : null}
        </div>

        <div className={styles.previewFrame}>
          <div
            className={styles.previewOuter}
            style={{ backgroundColor: theme.data.colors['background'] }}
          >
            <div
              className={styles.previewInner}
              style={{ backgroundColor: theme.data.colors['card'] }}
            >
              <div className={styles.previewCopy}>
                <div
                  className={styles.previewTitle}
                  style={{ color: theme.data.colors['background_text'], fontFamily: `"${theme.data.fonts.textFont.name}", ui-serif, Georgia, serif` }}
                >
                  {theme.name}
                </div>
                <div
                  className={styles.previewSubtitle}
                  style={{ color: theme.data.colors['background_text'], fontFamily: `"${theme.data.fonts.textFont.name}", ui-serif, Georgia, serif` }}
                >
                  {t('ppt_generator.theme.card.previewSubtitle')}
                </div>
                <div
                  className={styles.previewAccent}
                  style={{ backgroundColor: theme.data.colors['primary'] }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerCopy}>
          <h4 className={styles.footerTitle}>{theme.name}</h4>
          <div className={styles.swatchRow}>
            <span className={styles.swatch} style={{ backgroundColor: theme.data.colors['primary'] }} />
            <span className={styles.swatch} style={{ backgroundColor: theme.data.colors['background'] }} />
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(theme.id)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }
          }}
          className={joinClassNames([styles.copyButton, copied && styles.copyButtonActive])}
          title={copied ? t('ppt_generator.theme.card.copyDone') : t('ppt_generator.theme.card.copy')}
          aria-label={copied
            ? t('ppt_generator.theme.card.copyDoneAria')
            : t('ppt_generator.theme.card.copyAria', { name: theme.name })}
        >
          {copied ? <Check className="h-4.5 w-4.5" /> : <Copy className="h-4.5 w-4.5" />}
        </button>
      </div>
    </div>
  )
}

