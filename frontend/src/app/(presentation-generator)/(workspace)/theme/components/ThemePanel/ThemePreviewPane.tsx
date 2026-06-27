'use client'

import React from 'react'
import { useI18n } from '@/shared/i18n'
import type { ThemePreviewLayout } from './themePreviewLoader'
import styles from './ThemePanel.module.css'

interface ThemePreviewPaneProps {
  slideContainerRef: React.RefObject<HTMLDivElement>
  previewScale: number
  previewSlideWidth: number
  previewSlideHeight: number
  totalThemeCount: number
  previewLayouts: ThemePreviewLayout[]
  isLoading: boolean
}

export const ThemePreviewPane: React.FC<ThemePreviewPaneProps> = ({
  slideContainerRef,
  previewScale,
  previewSlideWidth,
  previewSlideHeight,
  totalThemeCount,
  previewLayouts,
  isLoading,
}) => {
  const { t } = useI18n()

  return (
    <div className={styles.previewPane}>
      <div className={styles.previewHeader}>
        <div className={styles.previewBadge}>{t('presenton.theme.preview.badge')}</div>
        <h3 className={styles.previewTitle}>{t('presenton.theme.preview.title')}</h3>
        <p className={styles.previewText}>
          {totalThemeCount > 0
            ? t('presenton.theme.preview.bodyReady')
            : t('presenton.theme.preview.bodyEmpty')}
        </p>
      </div>

      <div
        ref={slideContainerRef}
        style={{ backgroundColor: 'var(--page-background-color)' }}
        className={styles.previewViewport}
      >
        {isLoading && previewLayouts.length === 0 ? (
          <div className={styles.previewLoadingStack}>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={`theme-preview-loading-${index}`} className={styles.previewSlideRail}>
                <div
                  className={`${styles.previewSlideFrame} ${styles.previewSkeletonFrame}`}
                  style={{
                    width: `${previewSlideWidth}px`,
                    height: `${previewSlideHeight}px`,
                  }}
                >
                  <div className={styles.previewSkeletonCanvas} />
                </div>
              </div>
            ))}
          </div>
        ) : previewLayouts.length > 0 ? previewLayouts.map((layout) => {
          const {
            component: LayoutComponent,
            sampleData,
          } = layout

          return (
            <div key={layout.layoutId} className={styles.previewSlideRail}>
              <div
                className={styles.previewSlideFrame}
                style={{
                  width: `${previewSlideWidth}px`,
                  height: `${previewSlideHeight}px`,
                }}
              >
                <div
                  className={styles.previewSlideCanvas}
                  style={{
                    width: 1280,
                    height: 720,
                    transform: `scale(${previewScale})`,
                  }}
                >
                  <LayoutComponent data={sampleData} />
                </div>
              </div>
            </div>
          )
        }) : (
          <div className={styles.previewEmptyState}>
            <p className={styles.previewEmptyText}>
              {t('presenton.theme.preview.empty')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
