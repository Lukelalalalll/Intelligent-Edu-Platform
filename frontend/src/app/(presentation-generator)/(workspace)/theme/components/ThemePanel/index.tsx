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
    template,
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
    ? 'Open a foundation theme and shape it into something brand-ready.'
    : 'Keep saved theme directions close to the next deck you build.'
  const sectionDescription = tab === 'default'
    ? 'Built-in themes stay grouped in one workspace so you can inspect the palette direction before opening the editor and saving a custom version.'
    : 'Custom themes keep your saved colors, fonts, and branding within easy reach whenever a new deck needs a familiar visual system.'

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <WelcomeBanner
          title="Themes"
          subtitle="Shape built-in palettes into brand-ready slide themes, reopen saved directions, and keep the Presenton workspace visually consistent."
          variant="workspace"
          className={styles.banner}
        />

        <div className={styles.navShell}>
          <nav className={styles.navList} aria-label="Presenton workspace navigation">
            {presentonNavItems.map(({ href, label, renderIcon }) => {
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
                  Presenton workspace
                </div>
                <h2 className={styles.controlTitle}>Keep every deck theme in a calmer, card-based workspace.</h2>
                <p className={styles.controlDescription}>
                  Browse the shared library, tune colors and typography, and save reusable theme directions without leaving the Presenton flow.
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
                  aria-label="Create new theme"
                >
                  <span>New Theme</span>
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <p className={styles.controlHelper}>
                  Theme editing stays front-end only here: the redesign changes layout and hierarchy, not the API flow or saved theme data model.
                </p>
              </div>
            </div>

            <div className={styles.controlBottom}>
              <div className={styles.tabBlock}>
                <div className={styles.tabRail} role="tablist" aria-label="Theme library views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'default'}
                    className={joinClassNames([styles.tabButton, tab === 'default' && styles.tabButtonActive])}
                    onClick={() => handleTabChange('default')}
                  >
                    Built-in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'custom'}
                    className={joinClassNames([styles.tabButton, tab === 'custom' && styles.tabButtonActive])}
                    onClick={() => handleTabChange('custom')}
                  >
                    Custom
                  </button>
                </div>
                <p className={styles.activeTabNote}>{activeTabDescription}</p>
              </div>

              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Built-in themes</span>
                  <div className={styles.statValue}>{defaultThemes.length}</div>
                  <p className={styles.statMeta}>Shared Presenton foundations ready to personalize.</p>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Custom themes</span>
                  <div className={styles.statValue}>{isCustomThemesLoading ? '...' : customThemes.length}</div>
                  <p className={styles.statMeta}>
                    {isCustomThemesLoading
                      ? 'Loading your saved theme library.'
                      : customThemes.length === 1
                        ? 'Saved custom theme ready to reopen.'
                        : 'Saved custom themes ready to reopen.'}
                  </p>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Active view</span>
                  <div className={styles.statValue}>{tab === 'default' ? 'Built-in' : 'Custom'}</div>
                  <p className={styles.statMeta}>
                    {activeThemeCount} {activeThemeCount === 1 ? 'theme' : 'themes'} visible in this section.
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
                  {tab === 'default' ? 'Built-in library' : 'Custom library'}
                </div>
                <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
                <p className={styles.sectionDescription}>{sectionDescription}</p>
              </div>

              <div className={styles.groupCount}>
                {tab === 'custom' && isCustomThemesLoading
                  ? 'Loading'
                  : `${activeThemeCount} ${activeThemeCount === 1 ? 'theme' : 'themes'}`}
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
                <p className={styles.loadingTitle}>Loading custom themes</p>
                <p className={styles.loadingText}>
                  Pulling your saved theme directions into the Presenton workspace.
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
          template={template}
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
