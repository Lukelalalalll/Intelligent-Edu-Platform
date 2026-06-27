'use client'

import React from 'react'
import {
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Palette,
  PanelTop,
  Sparkles,
} from 'lucide-react'
import Link from '@/presenton/shims/next-link'
import { MixpanelEvent, trackEvent } from '@/utils/mixpanel'
import WorkspaceCard from '@/shared/components/Card/Card'
import WelcomeBanner from '@/shared/components/WelcomeBanner'
import { useI18n } from '@/shared/i18n'
import entranceStyles from '@/shared/page-entrance/PageEntrance.module.css'
import { usePageEntrance } from '@/shared/page-entrance/usePageEntrance'
import CustomTabEmpty from './CustomTabEmpty'
import { ThemeCard } from './ThemeCard'
import { ThemeEditorSheet } from './ThemeEditorSheet'
import { joinClassNames } from './themePanelHelpers'
import { useThemePanelController } from './useThemePanelController'
import styles from './ThemePanel.module.css'

const TemplateNavIcon = ({ active }: { active: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke={active ? '#007b55' : '#667085'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={styles.navIcon}
    aria-hidden="true"
  >
    <path d="M4 14h6" />
    <path d="M4 2h10" />
    <rect x="4" y="18" width="16" height="4" rx="1" />
    <rect x="4" y="6" width="16" height="4" rx="1" />
  </svg>
)

const presentonNavItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    renderIcon: (active: boolean) => (
      <LayoutDashboard className={styles.navIcon} color={active ? '#007b55' : '#667085'} />
    ),
  },
  {
    href: '/templates',
    label: 'Templates',
    renderIcon: (active: boolean) => <TemplateNavIcon active={active} />,
  },
  {
    href: '/theme',
    label: 'Themes',
    renderIcon: (active: boolean) => (
      <Palette className={styles.navIcon} color={active ? '#007b55' : '#667085'} />
    ),
  },
] as const

const ThemePanel: React.FC = () => {
  const { t } = useI18n()
  const isEntranceActive = usePageEntrance()
  const { pathname, libraryState, editorState, previewState, actions } = useThemePanelController()
  const { tab, activeTabDescription, activeThemeCount, totalThemeCount, defaultThemes, customThemes, isCustomThemesLoading } = libraryState
  const {
    selectedTheme,
    isSheetOpen,
    currentStep,
    currentStepMeta,
    isNewTheme,
    customColors,
    customFonts,
    customBrandLogo,
    isLogoUploading,
    isFontUploading,
    showColorPicker,
    themeCompanyName,
    userFonts,
  } = editorState
  const {
    slideContainerRef,
    previewScale,
    previewSlideWidth,
    previewSlideHeight,
    previewLayouts,
    isPreviewLayoutsLoading,
  } = previewState
  const {
    handleCloseSheet,
    handleThemeSelect,
    handleDelete,
    handleClickOutside,
    handleColorChange,
    handleShowColorPicker,
    handleRefreshTheme,
    handleFontSelect,
    handleBrandLogoUpload,
    handleCustomFontChange,
    handleTabChange,
    handleThemeNameBlur,
    handleThemeCompanyNameBlur,
    handleRemoveLogo,
    handlePreviousStep,
    handlePrimaryStepAction,
  } = actions

  const sectionTitle = tab === 'default'
    ? t('presenton.theme.section.builtIn.title')
    : t('presenton.theme.section.custom.title')
  const sectionDescription = tab === 'default'
    ? t('presenton.theme.section.builtIn.body')
    : t('presenton.theme.section.custom.body')

  const navItems = [
    {
      href: '/dashboard',
      label: t('presenton.workspace.nav.dashboard'),
      renderIcon: presentonNavItems[0].renderIcon,
    },
    {
      href: '/templates',
      label: t('presenton.workspace.nav.templates'),
      renderIcon: presentonNavItems[1].renderIcon,
    },
    {
      href: '/theme',
      label: t('presenton.workspace.nav.theme'),
      renderIcon: presentonNavItems[2].renderIcon,
    },
  ] as const

  return (
    <div className={styles.page}>
      <div
        className={joinClassNames([
          styles.container,
          entranceStyles.workspaceEntrance,
          isEntranceActive && entranceStyles.workspaceEntranceActive,
        ])}
      >
        <WelcomeBanner
          title={t('presenton.theme.banner.title')}
          subtitle={t('presenton.theme.banner.subtitle')}
          variant="workspace"
          className={styles.banner}
        />

        <div className={styles.navShell}>
          <nav className={styles.navList} aria-label={t('presenton.workspace.nav.aria')}>
            {navItems.map(({ href, label, renderIcon }) => {
              const isActive = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={joinClassNames([styles.navItem, isActive && styles.navItemActive])}
                >
                  {renderIcon(isActive)}
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <WorkspaceCard className={styles.surfaceCard}>
          <div className={styles.controlSection}>
            <div className={styles.controlTop}>
              <div className={styles.controlCopy}>
                <div className={styles.badge}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('presenton.theme.controls.badge')}
                </div>
                <h2 className={styles.controlTitle}>{t('presenton.theme.controls.title')}</h2>
                <p className={styles.controlDescription}>
                  {t('presenton.theme.controls.body')}
                </p>
              </div>

              <div className={styles.controlActions}>
                <Link
                  href="/theme?tab=new-theme"
                  onClick={() => trackEvent(MixpanelEvent.Theme_New_Theme_Clicked, {
                    pathname,
                    source: 'theme_workspace_primary_cta',
                  })}
                  className={styles.primaryAction}
                  aria-label={t('presenton.theme.controls.createAria')}
                >
                  <span>{t('presenton.theme.controls.create')}</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <p className={styles.controlHelper}>
                  {t('presenton.theme.controls.helper')}
                </p>
              </div>
            </div>

            <div className={styles.controlBottom}>
              <div className={styles.tabBlock}>
                <div className={styles.tabRail} role="tablist" aria-label={t('presenton.theme.tabs.aria')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'default'}
                    className={joinClassNames([styles.tabButton, tab === 'default' && styles.tabButtonActive])}
                    onClick={() => handleTabChange('default')}
                  >
                    {t('presenton.theme.tabs.builtIn')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'custom'}
                    className={joinClassNames([styles.tabButton, tab === 'custom' && styles.tabButtonActive])}
                    onClick={() => handleTabChange('custom')}
                  >
                    {t('presenton.theme.tabs.custom')}
                  </button>
                </div>
                <p className={styles.activeTabNote}>{activeTabDescription}</p>
              </div>

              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>{t('presenton.theme.stats.builtIn.label')}</span>
                  <div className={styles.statValue}>{defaultThemes.length}</div>
                  <p className={styles.statMeta}>{t('presenton.theme.stats.builtIn.meta')}</p>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>{t('presenton.theme.stats.custom.label')}</span>
                  <div className={styles.statValue}>{isCustomThemesLoading ? '...' : customThemes.length}</div>
                  <p className={styles.statMeta}>
                    {isCustomThemesLoading
                      ? t('presenton.theme.stats.custom.metaLoading')
                      : customThemes.length === 1
                        ? t('presenton.theme.stats.custom.metaOne')
                        : t('presenton.theme.stats.custom.metaOther')}
                  </p>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>{t('presenton.theme.stats.active.label')}</span>
                  <div className={styles.statValue}>{tab === 'default' ? t('presenton.theme.tabs.builtIn') : t('presenton.theme.tabs.custom')}</div>
                  <p className={styles.statMeta}>
                    {activeThemeCount === 1
                      ? t('presenton.theme.stats.active.countOne', { count: activeThemeCount })
                      : t('presenton.theme.stats.active.countOther', { count: activeThemeCount })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </WorkspaceCard>

        <WorkspaceCard className={styles.surfaceCard}>
          <div className={styles.contentSection}>
            <div className={styles.sectionIntro}>
              <div className={styles.sectionTitleWrap}>
                <div className={styles.mutedBadge}>
                  <PanelTop className="h-3.5 w-3.5" />
                  {tab === 'default' ? t('presenton.theme.section.builtIn.badge') : t('presenton.theme.section.custom.badge')}
                </div>
                <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
                <p className={styles.sectionDescription}>{sectionDescription}</p>
              </div>

              <div className={styles.groupCount}>
                {tab === 'custom' && isCustomThemesLoading
                  ? t('presenton.theme.section.loading')
                  : activeThemeCount === 1
                    ? t('presenton.theme.section.countOne', { count: activeThemeCount })
                    : t('presenton.theme.section.countOther', { count: activeThemeCount })}
              </div>
            </div>

            {tab === 'default' ? (
              <div className={styles.themeGrid}>
                {defaultThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    onDelete={handleDelete}
                    onSelect={handleThemeSelect}
                    showDeleteButton={false}
                  />
                ))}
              </div>
            ) : isCustomThemesLoading ? (
              <div className={styles.loadingCard}>
                <Loader2 className={joinClassNames(['animate-spin', styles.loadingIcon])} />
                <p className={styles.loadingTitle}>{t('presenton.theme.loading.title')}</p>
                <p className={styles.loadingText}>
                  {t('presenton.theme.loading.body')}
                </p>
              </div>
            ) : customThemes.length > 0 ? (
              <div className={styles.themeGrid}>
                {customThemes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    onDelete={handleDelete}
                    onSelect={handleThemeSelect}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.themeGrid}>
                <CustomTabEmpty />
              </div>
            )}
          </div>
        </WorkspaceCard>

        <ThemeEditorSheet
          open={isSheetOpen}
          onOpenChange={handleCloseSheet}
          selectedTheme={selectedTheme}
          isNewTheme={isNewTheme}
          currentStep={currentStep}
          currentStepMeta={currentStepMeta}
          customColors={customColors}
          customFonts={customFonts}
          customBrandLogo={customBrandLogo}
          isLogoUploading={isLogoUploading}
          isFontUploading={isFontUploading}
          showColorPicker={showColorPicker}
          themeCompanyName={themeCompanyName}
          userFonts={userFonts}
          totalThemeCount={totalThemeCount}
          slideContainerRef={slideContainerRef}
          previewScale={previewScale}
          previewSlideWidth={previewSlideWidth}
          previewSlideHeight={previewSlideHeight}
          previewLayouts={previewLayouts}
          isPreviewLayoutsLoading={isPreviewLayoutsLoading}
          onClickOutside={handleClickOutside}
          onShowColorPicker={handleShowColorPicker}
          onColorChange={handleColorChange}
          onRefreshTheme={handleRefreshTheme}
          onFontSelect={handleFontSelect}
          onFontUpload={handleCustomFontChange}
          onBrandLogoUpload={handleBrandLogoUpload}
          onThemeNameBlur={handleThemeNameBlur}
          onThemeCompanyNameBlur={handleThemeCompanyNameBlur}
          onRemoveLogo={handleRemoveLogo}
          onPreviousStep={handlePreviousStep}
          onPrimaryAction={handlePrimaryStepAction}
        />
      </div>
    </div>
  )
}

export default ThemePanel
