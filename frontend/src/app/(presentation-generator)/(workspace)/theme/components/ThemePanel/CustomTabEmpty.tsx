"use client";

import { ArrowRight, Plus, Sparkles } from 'lucide-react'
import React from 'react'
import Link from '@/ppt_generator/shims/next-link'
import { useI18n } from '@/shared/i18n'
import styles from './CustomTabEmpty.module.css'

const CustomTabEmpty = () => {
  const { t } = useI18n()

  return (
    <Link href="/theme?tab=new-theme" className={styles.card}>
      <div className={styles.previewShell}>
        <img src="/card_bg.svg" alt="" className={styles.previewBackground} />
        <div className={styles.plusBadge}>
          <div className={styles.plusBadgeInner}>
            <Plus className="h-4 w-4 text-[#A2A0A1]" />
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.iconShell}>
          <Sparkles className="h-5 w-5 text-white" />
        </div>

        <div className={styles.copy}>
          <h4 className={styles.title}>{t('ppt_generator.theme.empty.title')}</h4>
          <p className={styles.subtitle}>
            {t('ppt_generator.theme.empty.body')}
          </p>
        </div>

        <div className={styles.arrowShell}>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  )
}

export default CustomTabEmpty

