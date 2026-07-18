'use client'

import React from 'react'
import { useI18n } from '@/shared/i18n'
import { THEME_PREVIEW_LAYOUT_LIMIT, type ThemePreviewLayout } from './themePreviewLoader'
import styles from './ThemePanel.module.css'

interface ThemePreviewPaneProps {
  slideContainerRef: React.RefObject<HTMLDivElement>
  previewThemeStyle: React.CSSProperties
  previewScale: number
  previewSlideWidth: number
  previewSlideHeight: number
  totalThemeCount: number
  previewLayouts: ThemePreviewLayout[]
  isLoading: boolean
}

export const ThemePreviewPane: React.FC<ThemePreviewPaneProps> = ({
  slideContainerRef,
  previewThemeStyle,
  previewScale,
  previewSlideWidth,
  previewSlideHeight,
  totalThemeCount,
  previewLayouts,
  isLoading,
}) => {
  const { t } = useI18n()
  const previewCount = previewLayouts.length || THEME_PREVIEW_LAYOUT_LIMIT

  return (
    <div className={styles.previewPane}>
      <div className={styles.previewHeader}>
        <div className={styles.previewBadge}>{t('ppt_generator.theme.preview.badge')}</div>
        <h3 className={styles.previewTitle}>{t('ppt_generator.theme.preview.title')}</h3>
        <p className={styles.previewText}>
          {totalThemeCount > 0
            ? t('ppt_generator.theme.preview.bodyReady')
            : t('ppt_generator.theme.preview.bodyEmpty')}
        </p>
        <div className={styles.previewMetaRow}>
          <span className={styles.previewMetaPill}>
            {t('ppt_generator.theme.preview.meta', { count: previewCount })}
          </span>
        </div>
      </div>

      <div
        ref={slideContainerRef}
        style={previewThemeStyle}
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
                  backgroundColor: 'var(--page-background-color, var(--background-color, #ffffff))',
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
              {t('ppt_generator.theme.preview.empty')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
