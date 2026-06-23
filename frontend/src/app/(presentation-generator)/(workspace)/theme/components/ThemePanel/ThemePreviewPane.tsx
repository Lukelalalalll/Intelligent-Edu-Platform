'use client'

import React from 'react'
import { getTemplatesByTemplateName } from '@/app/presentation-templates'
import styles from './ThemePanel.module.css'

interface ThemePreviewPaneProps {
  slideContainerRef: React.RefObject<HTMLDivElement>
  previewScale: number
  previewSlideWidth: number
  previewSlideHeight: number
  totalThemeCount: number
  template: ReturnType<typeof getTemplatesByTemplateName>
}

export const ThemePreviewPane: React.FC<ThemePreviewPaneProps> = ({
  slideContainerRef,
  previewScale,
  previewSlideWidth,
  previewSlideHeight,
  totalThemeCount,
  template,
}) => (
  <div className={styles.previewPane}>
    <div className={styles.previewHeader}>
      <div className={styles.previewBadge}>Live Preview</div>
      <h3 className={styles.previewTitle}>See every change against the current Presenton slide stack.</h3>
      <p className={styles.previewText}>
        {totalThemeCount > 0
          ? 'Colors, fonts, and branding update immediately so you can judge the deck feel before saving.'
          : 'Start with the defaults, then tune the theme while the preview keeps the slide system in context.'}
      </p>
    </div>

    <div
      ref={slideContainerRef}
      style={{ backgroundColor: 'var(--page-background-color)' }}
      className={styles.previewViewport}
    >
      {template && template.map((layout) => {
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
      })}
    </div>
  </div>
)
