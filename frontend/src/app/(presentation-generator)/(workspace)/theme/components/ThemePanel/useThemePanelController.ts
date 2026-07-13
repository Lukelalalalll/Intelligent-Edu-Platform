'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notify } from '@/components/ui/sonner'
import { Theme } from '@/app/(presentation-generator)/services/api/types'
import { ImagesApi } from '@/app/(presentation-generator)/services/api/images'
import ThemeApi from '@/app/(presentation-generator)/services/api/theme'
import { usePathname, useRouter, useSearchParams } from '@/ppt_generator/shims/next-navigation'
import { useFontLoader as loadFontAssets } from '@/app/(presentation-generator)/hooks/useFontLoad'
import { useI18n } from '@/shared/i18n'
import { MixpanelEvent, trackEvent } from '@/utils/mixpanel'
import {
  FALLBACK_THEME,
  PREVIEW_BASE_HEIGHT,
  PREVIEW_BASE_WIDTH,
  THEME_EDITOR_STEP_IDS,
  THEME_EDITOR_STEPS,
} from './constants'
import {
  buildThemeCssVariables,
  buildThemeParams,
  buildThemeWithCustomizations,
  calculatePreviewScale,
  createNewCustomThemeDraft,
  extractThemeEditorValues,
  getDefaultThemes,
  getThemeSource,
  isPersistedCustomTheme,
  mapGeneratedThemeColors,
  normalizeTheme,
} from './themePanelHelpers'
import { loadThemePreviewLayouts } from './themePreviewLoader'
import type { ThemePreviewLayout } from './themePreviewLoader'
import {
  ThemeColors,
  ThemeEditorStepId,
  ThemeFonts,
  ThemePaletteGenerationSource,
  ThemePaletteSeedSnapshot,
  ThemeTab,
  UserFontLibrary,
} from './types'

type GenerateThemeOptions = {
  primary?: string
  background?: string
  source: ThemePaletteGenerationSource
}

export function useThemePanelController() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const newThemeTab = searchParams.get('tab')
  const initialEditorValues = extractThemeEditorValues(FALLBACK_THEME)
  const newThemeRequestRef = useRef<string | null>(null)
  const shouldHydrateDefaultThemeRef = useRef(true)

  const [selectedTheme, setSelectedTheme] = useState<Theme>(FALLBACK_THEME)
  const [tab, setTab] = useState<ThemeTab>('default')
  const [customColors, setCustomColors] = useState<ThemeColors>(initialEditorValues.colors)
  const [customFonts, setCustomFonts] = useState<ThemeFonts>(initialEditorValues.fonts)
  const [customBrandLogo, setCustomBrandLogo] = useState<string | null>(initialEditorValues.brandLogo)
  const [customBrandLogoId, setCustomBrandLogoId] = useState<string | null>(initialEditorValues.brandLogoId)
  const [isLogoUploading, setIsLogoUploading] = useState(false)
  const [isFontUploading, setIsFontUploading] = useState(false)
  const [customThemes, setCustomThemes] = useState<Theme[]>([])
  const [isCustomThemesLoading, setIsCustomThemesLoading] = useState(true)
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<ThemeEditorStepId>('colors')
  const [themeCompanyName, setThemeCompanyName] = useState('')
  const [isNewTheme, setIsNewTheme] = useState(false)
  const [userFonts, setUserFonts] = useState<UserFontLibrary>({ fonts: [] })
  const [slideContainerWidth, setSlideContainerWidth] = useState(0)
  const [previewLayouts, setPreviewLayouts] = useState<ThemePreviewLayout[]>([])
  const [isPreviewLayoutsLoading, setIsPreviewLayoutsLoading] = useState(false)
  const [isPaletteGenerating, setIsPaletteGenerating] = useState(false)
  const [lastGeneratedPaletteSeeds, setLastGeneratedPaletteSeeds] =
    useState<ThemePaletteSeedSnapshot | null>(null)
  const [paletteSeedMode, setPaletteSeedMode] = useState<'generated' | 'manual'>('generated')

  const slideContainerRef = useRef<HTMLDivElement>(null)
  const previousSelectedThemeIdRef = useRef(selectedTheme.id)

  const defaultThemes = useMemo(() => getDefaultThemes(t), [t])
  const currentStepIndex = Math.max(THEME_EDITOR_STEP_IDS.indexOf(currentStep), 0)
  const currentStepMeta = THEME_EDITOR_STEPS[currentStepIndex]
  const totalSteps = THEME_EDITOR_STEPS.length
  const activeTabDescription = tab === 'default'
    ? t('ppt_generator.theme.activeTab.builtIn')
    : t('ppt_generator.theme.activeTab.custom')
  const totalThemeCount = defaultThemes.length + customThemes.length
  const activeThemeCount = tab === 'default' ? defaultThemes.length : customThemes.length
  const paletteDirty = useMemo(() => {
    if (!lastGeneratedPaletteSeeds) return false
    return (
      customColors.primary !== lastGeneratedPaletteSeeds.primary ||
      customColors.background !== lastGeneratedPaletteSeeds.background
    )
  }, [customColors.background, customColors.primary, lastGeneratedPaletteSeeds])
  const previewScale = useMemo(
    () => calculatePreviewScale(slideContainerWidth),
    [slideContainerWidth]
  )
  const previewSlideHeight = PREVIEW_BASE_HEIGHT * previewScale
  const previewSlideWidth = PREVIEW_BASE_WIDTH * previewScale
  const previewTheme = useMemo(
    () =>
      buildThemeWithCustomizations(selectedTheme, {
        colors: customColors,
        fonts: customFonts,
        brandLogo: customBrandLogo,
        companyName: themeCompanyName,
      }),
    [customBrandLogo, customColors, customFonts, selectedTheme, themeCompanyName]
  )
  const previewThemeStyle = useMemo(
    () => buildThemeCssVariables(previewTheme),
    [previewTheme]
  )

  const buildPaletteSeedSnapshot = useCallback(
    (colors: ThemeColors): ThemePaletteSeedSnapshot => ({
      primary: colors.primary,
      background: colors.background,
    }),
    []
  )

  useEffect(() => {
    trackEvent(MixpanelEvent.Theme_Page_Viewed, { pathname })
  }, [pathname])

  useEffect(() => {
    if (!isSheetOpen) return

    const element = slideContainerRef.current
    if (!element) return

    const resizeObserver = new ResizeObserver(() => {
      setSlideContainerWidth(element.clientWidth)
    })

    resizeObserver.observe(element)

    return () => resizeObserver.disconnect()
  }, [isSheetOpen])

  useEffect(() => {
    if (!isSheetOpen || previewLayouts.length > 0) return

    let cancelled = false

    const loadPreviewLayouts = async () => {
      try {
        setIsPreviewLayoutsLoading(true)
        const layouts = await loadThemePreviewLayouts()
        if (!cancelled) {
          setPreviewLayouts(layouts)
        }
      } catch (error) {
        console.error('Failed to load theme preview layouts', error)
      } finally {
        if (!cancelled) {
          setIsPreviewLayoutsLoading(false)
        }
      }
    }

    void loadPreviewLayouts()

    return () => {
      cancelled = true
    }
  }, [isSheetOpen, previewLayouts.length])

  useEffect(() => {
    if (!isSheetOpen) return

    loadFontAssets({
      [previewTheme.data.fonts.textFont.name]: previewTheme.data.fonts.textFont.url,
    })
  }, [isSheetOpen, previewTheme])

  useEffect(() => {
    let isCancelled = false

    const loadCustomThemes = async () => {
      try {
        const apiThemes = (await ThemeApi.getThemes()).map((theme) => normalizeTheme(theme))
        if (isCancelled) return

        setCustomThemes(apiThemes)
        apiThemes
          .map((theme) => theme.data.fonts.textFont)
          .forEach((font) => {
            loadFontAssets({ [font.name]: font.url })
          })
      } catch (error: any) {
        console.error('Failed to load custom themes', error)
        notify.error(
          t('ppt_generator.theme.notify.loadThemes.title'),
          error?.message || t('ppt_generator.theme.notify.loadThemes.body')
        )
      } finally {
        if (!isCancelled) {
          setIsCustomThemesLoading(false)
        }
      }
    }

    const loadUserFonts = async () => {
      try {
        const uploadedFonts = await ThemeApi.getUserFonts()
        if (!isCancelled) {
          setUserFonts(uploadedFonts)
        }
      } catch (error: any) {
        console.error('Failed to load user fonts', error)
        notify.error(
          t('ppt_generator.theme.notify.loadFonts.title'),
          error?.message || t('ppt_generator.theme.notify.loadFonts.body')
        )
      }
    }

    if (
      defaultThemes.length > 0 &&
      shouldHydrateDefaultThemeRef.current &&
      newThemeTab !== 'new-theme'
    ) {
      const firstTheme = defaultThemes[0]
      const editorValues = extractThemeEditorValues(firstTheme)

      shouldHydrateDefaultThemeRef.current = false
      setSelectedTheme(firstTheme)
      setCustomColors(editorValues.colors)
      setCustomFonts(editorValues.fonts)
      setCustomBrandLogo(editorValues.brandLogo)
      setCustomBrandLogoId(editorValues.brandLogoId)
      setThemeCompanyName(editorValues.companyName)
      setLastGeneratedPaletteSeeds(buildPaletteSeedSnapshot(editorValues.colors))
      setPaletteSeedMode('generated')
    }

    void loadCustomThemes()
    void loadUserFonts()

    return () => {
      isCancelled = true
    }
  }, [buildPaletteSeedSnapshot, defaultThemes, newThemeTab, t])

  useEffect(() => {
    if (previousSelectedThemeIdRef.current === selectedTheme.id) return

    previousSelectedThemeIdRef.current = selectedTheme.id
    const editorValues = extractThemeEditorValues(selectedTheme)
    setCustomColors(editorValues.colors)
    setCustomFonts(editorValues.fonts)
    setCustomBrandLogo(editorValues.brandLogo)
    setCustomBrandLogoId(editorValues.brandLogoId)
    setThemeCompanyName(editorValues.companyName)
    setLastGeneratedPaletteSeeds(buildPaletteSeedSnapshot(editorValues.colors))
    setPaletteSeedMode('generated')
  }, [buildPaletteSeedSnapshot, selectedTheme])

  const handleCloseSheet = useCallback((open: boolean) => {
    setIsSheetOpen(open)
    if (!open) {
      setSlideContainerWidth(0)
      router.replace('/theme')
    }
  }, [router])

  const handleThemeSelect = useCallback((theme: Theme) => {
    const editorValues = extractThemeEditorValues(theme)

    setIsNewTheme(false)
    setSelectedTheme(theme)
    setCustomColors(editorValues.colors)
    setCustomFonts(editorValues.fonts)
    setCustomBrandLogo(editorValues.brandLogo)
    setCustomBrandLogoId(editorValues.brandLogoId)
    setThemeCompanyName(editorValues.companyName)
    setIsSheetOpen(true)
    setCurrentStep('colors')
    setLastGeneratedPaletteSeeds(buildPaletteSeedSnapshot(editorValues.colors))
    setPaletteSeedMode('generated')

    const themeSource = getThemeSource(theme)

    trackEvent(MixpanelEvent.Theme_Selected, {
      pathname,
      theme_id: theme.id,
      theme_name: theme.name,
      theme_source: themeSource,
    })
    trackEvent(MixpanelEvent.Theme_Editor_Opened, {
      pathname,
      theme_id: theme.id,
      theme_name: theme.name,
      theme_source: themeSource,
    })
  }, [buildPaletteSeedSnapshot, pathname])

  const handleColorChange = useCallback((colorKey: keyof ThemeColors, value: string) => {
    const validValue = value && !value.startsWith('#') ? `#${value}` : value
    setCustomColors((currentColors) => ({
      ...currentColors,
      [colorKey]: validValue,
    }))
    if (colorKey === 'primary' || colorKey === 'background') {
      setPaletteSeedMode('manual')
    }
  }, [])

  const handleShowColorPicker = useCallback((colorKey: string | null) => {
    setShowColorPicker(colorKey)
  }, [])

  const handleFontSelect = useCallback((fontName: string, url: string) => {
    setCustomFonts({ textFont: { name: fontName, url } })
    trackEvent(MixpanelEvent.Theme_Font_Changed, {
      pathname,
      font_name: fontName,
      font_url: url,
      theme_id: selectedTheme.id,
    })
  }, [pathname, selectedTheme.id])

  const handleBrandLogoUpload = useCallback(async (file: File) => {
    try {
      setIsLogoUploading(true)
      const uploaded = await ImagesApi.uploadImage(file)
      setCustomBrandLogo(uploaded.path)
      setCustomBrandLogoId(uploaded.id)
      trackEvent(MixpanelEvent.Theme_Logo_Uploaded, {
        pathname,
        theme_id: selectedTheme.id,
        file_name: file.name,
        file_size_bytes: file.size,
      })
    } catch (error: any) {
      console.error('Failed to upload logo', error)
      notify.error(
        t('ppt_generator.theme.notify.uploadLogo.title'),
        error?.message || t('ppt_generator.theme.notify.uploadLogo.body')
      )
    } finally {
      setIsLogoUploading(false)
    }
  }, [pathname, selectedTheme.id, t])

  const generateTheme = useCallback(async ({
    primary,
    background,
    source,
  }: GenerateThemeOptions): Promise<ThemeColors> => {
    const generatedTheme = await ThemeApi.generateTheme({ primary, background })

    trackEvent(MixpanelEvent.Theme_Palette_Generated, {
      pathname,
      source,
      theme_id: selectedTheme.id,
      has_primary_seed: Boolean(primary),
      has_background_seed: Boolean(background),
    })

    return mapGeneratedThemeColors(generatedTheme)
  }, [pathname, selectedTheme.id])

  const createNewCustomTheme = useCallback(async () => {
    trackEvent(MixpanelEvent.Theme_New_Theme_Clicked, { pathname })
    setIsNewTheme(true)
    setIsPaletteGenerating(true)

    const newTheme = createNewCustomThemeDraft(t)
    let generatedColors = newTheme.data.colors
    try {
      generatedColors = await generateTheme({ source: 'new_theme' })
    } catch (error: any) {
      console.error('Failed to generate initial theme palette', error)
      notify.error(
        t('ppt_generator.theme.notify.generateFailed.title'),
        error?.message || t('ppt_generator.theme.notify.generateFailed.body')
      )
    } finally {
      setIsPaletteGenerating(false)
    }
    const nextTheme = {
      ...newTheme,
      data: {
        ...newTheme.data,
        colors: generatedColors,
      },
    }
    const editorValues = extractThemeEditorValues(nextTheme)

    setSelectedTheme(nextTheme)
    setCustomColors(editorValues.colors)
    setCustomFonts(editorValues.fonts)
    setCustomBrandLogo(editorValues.brandLogo)
    setCustomBrandLogoId(editorValues.brandLogoId)
    setIsSheetOpen(true)
    setCurrentStep('colors')
    setThemeCompanyName('')
    setLastGeneratedPaletteSeeds(buildPaletteSeedSnapshot(editorValues.colors))
    setPaletteSeedMode('generated')

    trackEvent(MixpanelEvent.Theme_Editor_Opened, {
      pathname,
      theme_id: nextTheme.id,
      theme_name: nextTheme.name,
      theme_source: 'new_draft',
    })
  }, [buildPaletteSeedSnapshot, generateTheme, pathname, t])

  const handleGeneratePalette = useCallback(async () => {
    try {
      setIsPaletteGenerating(true)
      const shouldPreserveCurrentSeeds = paletteSeedMode === 'manual'
      const generatedTheme = await generateTheme({
        primary: shouldPreserveCurrentSeeds ? customColors.primary : undefined,
        background: shouldPreserveCurrentSeeds ? customColors.background : undefined,
        source: 'refresh',
      })
      setCustomColors(generatedTheme)
      setLastGeneratedPaletteSeeds(buildPaletteSeedSnapshot(generatedTheme))
      if (!shouldPreserveCurrentSeeds) {
        setPaletteSeedMode('generated')
      }
    } catch (error: any) {
      console.error('Failed to generate theme palette', error)
      notify.error(
        t('ppt_generator.theme.notify.generateFailed.title'),
        error?.message || t('ppt_generator.theme.notify.generateFailed.body')
      )
    } finally {
      setIsPaletteGenerating(false)
    }
  }, [
    buildPaletteSeedSnapshot,
    customColors.background,
    customColors.primary,
    generateTheme,
    paletteSeedMode,
    t,
  ])

  const saveTheme = useCallback(async () => {
    const saveBase = {
      theme: selectedTheme,
      colors: customColors,
      fonts: customFonts,
      brandLogo: customBrandLogo,
      brandLogoId: customBrandLogoId,
      companyName: themeCompanyName,
    }

    if (isPersistedCustomTheme(selectedTheme)) {
      try {
        trackEvent(MixpanelEvent.Theme_Save_Started, {
          pathname,
          mode: 'update',
          theme_id: selectedTheme.id,
          theme_name: selectedTheme.name,
        })

        const updatedTheme = normalizeTheme(
          await ThemeApi.updateTheme(buildThemeParams({
            ...saveBase,
            includeId: true,
          }))
        )

        setCustomThemes((themes) =>
          themes.map((theme) => (theme.id === updatedTheme.id ? updatedTheme : theme))
        )
        setSelectedTheme(updatedTheme)
        setIsSheetOpen(false)
        setSlideContainerWidth(0)
        trackEvent(MixpanelEvent.Theme_Saved, {
          pathname,
          mode: 'update',
          theme_id: updatedTheme.id,
          theme_name: updatedTheme.name,
          has_logo: Boolean(updatedTheme.logo_url),
          font_name: updatedTheme.data?.fonts?.textFont?.name || '',
        })
        notify.success(
          t('ppt_generator.theme.notify.updateSuccess.title'),
          t('ppt_generator.theme.notify.updateSuccess.body')
        )
      } catch (error: any) {
        console.error('Failed to update theme', error)
        notify.error(
          t('ppt_generator.theme.notify.updateFailed.title'),
          error?.message || t('ppt_generator.theme.notify.updateFailed.body')
        )
      }

      return
    }

    try {
      trackEvent(MixpanelEvent.Theme_Save_Started, {
        pathname,
        mode: 'create',
        theme_id: selectedTheme.id,
        theme_name: selectedTheme.name,
      })

      const createdTheme = normalizeTheme(
        await ThemeApi.createTheme(buildThemeParams(saveBase))
      )

      setCustomThemes((themes) => [...themes, createdTheme])
      setSelectedTheme(createdTheme)
      setIsSheetOpen(false)
      setSlideContainerWidth(0)
      router.replace('/theme')
      trackEvent(MixpanelEvent.Theme_Saved, {
        pathname,
        mode: 'create',
        theme_id: createdTheme.id,
        theme_name: createdTheme.name,
        has_logo: Boolean(createdTheme.logo_url),
        font_name: createdTheme.data?.fonts?.textFont?.name || '',
      })
      notify.success(
        t('ppt_generator.theme.notify.saveSuccess.title'),
        t('ppt_generator.theme.notify.saveSuccess.body')
      )
    } catch (error: any) {
      console.error('Failed to save theme', error)
      notify.error(
        t('ppt_generator.theme.notify.saveFailed.title'),
        error?.message || t('ppt_generator.theme.notify.saveFailed.body')
      )
    }
  }, [
    customBrandLogo,
    customBrandLogoId,
    customColors,
    customFonts,
    pathname,
    router,
    selectedTheme,
    t,
    themeCompanyName,
  ])

  const handleClickOutside = useCallback(() => {
    setShowColorPicker(null)
  }, [])

  const handleDelete = useCallback(async (themeId: string) => {
    try {
      await ThemeApi.deleteTheme(themeId)
      setCustomThemes((themes) => themes.filter((theme) => theme.id !== themeId))
      trackEvent(MixpanelEvent.Theme_Deleted, {
        pathname,
        theme_id: themeId,
      })
      notify.success(
        t('ppt_generator.theme.notify.deleteSuccess.title'),
        t('ppt_generator.theme.notify.deleteSuccess.body')
      )
    } catch (error: any) {
      console.error('Failed to delete theme', error)
      notify.error(
        t('ppt_generator.theme.notify.deleteFailed.title'),
        error?.message || t('ppt_generator.theme.notify.deleteFailed.body')
      )
    }
  }, [pathname, t])

  const handleCustomFontChange = useCallback(async (fontFile: File) => {
    try {
      setIsFontUploading(true)
      const { font_name, font_url } = await ThemeApi.uploadFont(fontFile)
      setCustomFonts({
        textFont: {
          name: font_name,
          url: font_url,
        },
      })
      trackEvent(MixpanelEvent.Theme_Custom_Font_Uploaded, {
        pathname,
        font_name: name,
        file_name: fontFile.name,
        file_size_bytes: fontFile.size,
      })
      trackEvent(MixpanelEvent.Theme_Font_Changed, {
        pathname,
        theme_id: selectedTheme.id,
        font_name,
        font_url,
        source: 'uploaded_font',
      })
      setUserFonts((existingFonts) => {
        if (existingFonts.fonts.some((font) => font.name === font_name)) {
          return existingFonts
        }

        return {
          fonts: [...existingFonts.fonts, { name: font_name, url: font_url }],
        }
      })
      notify.success(
        t('ppt_generator.theme.notify.uploadFontSuccess.title'),
        t('ppt_generator.theme.notify.uploadFontSuccess.body', { name: font_name })
      )
    } catch (error: any) {
      console.error('Failed to upload font', error)
      notify.error(
        t('ppt_generator.theme.notify.uploadFontFailed.title'),
        error?.message || t('ppt_generator.theme.notify.uploadFontFailed.body')
      )
    } finally {
      setIsFontUploading(false)
    }
  }, [pathname, selectedTheme.id, t])

  const handleTabChange = useCallback((nextTab: ThemeTab) => {
    trackEvent(MixpanelEvent.Theme_Tab_Switched, { pathname, tab: nextTab })
    setTab(nextTab)
  }, [pathname])

  const handleThemeNameBlur = useCallback((themeName: string) => {
    setSelectedTheme((theme) => ({
      ...theme,
      name: themeName,
    }))
  }, [])

  const handleThemeCompanyNameBlur = useCallback((companyName: string) => {
    setThemeCompanyName(companyName)
  }, [])

  const handleRemoveLogo = useCallback(() => {
    setSelectedTheme((theme) => ({
      ...theme,
      logo_url: '',
    }))
    setCustomBrandLogo('')
    setCustomBrandLogoId('')
  }, [])

  const handlePreviousStep = useCallback(() => {
    setCurrentStep((step) => {
      const stepIndex = THEME_EDITOR_STEP_IDS.indexOf(step)
      return THEME_EDITOR_STEP_IDS[Math.max(0, stepIndex - 1)]
    })
  }, [])

  const handlePrimaryStepAction = useCallback(() => {
    if (currentStep === 'brand') {
      void saveTheme()
      return
    }

    setCurrentStep((step) => {
      const stepIndex = THEME_EDITOR_STEP_IDS.indexOf(step)
      return THEME_EDITOR_STEP_IDS[Math.min(THEME_EDITOR_STEP_IDS.length - 1, stepIndex + 1)]
    })
  }, [currentStep, saveTheme])

  useEffect(() => {
    if (newThemeTab !== 'new-theme') {
      newThemeRequestRef.current = null
      return
    }

    if (newThemeRequestRef.current === newThemeTab) {
      return
    }

    newThemeRequestRef.current = newThemeTab
    void createNewCustomTheme()
  }, [createNewCustomTheme, newThemeTab])

  return {
    pathname,
    libraryState: {
      tab,
      activeTabDescription,
      activeThemeCount,
      totalThemeCount,
      defaultThemes,
      customThemes,
      isCustomThemesLoading,
    },
    editorState: {
      selectedTheme,
      isSheetOpen,
      currentStep,
      currentStepIndex,
      totalSteps,
      currentStepMeta,
      isNewTheme,
      customColors,
      customFonts,
      customBrandLogo,
      isLogoUploading,
      isFontUploading,
      isPaletteGenerating,
      paletteDirty,
      hasGeneratedPalette: Boolean(lastGeneratedPaletteSeeds),
      showColorPicker,
      themeCompanyName,
      userFonts,
    },
    previewState: {
      slideContainerRef,
      previewScale,
      previewSlideWidth,
      previewSlideHeight,
      previewLayouts,
      isPreviewLayoutsLoading,
      previewThemeStyle,
    },
    actions: {
      handleCloseSheet,
      handleThemeSelect,
      handleDelete,
      handleClickOutside,
      handleColorChange,
      handleShowColorPicker,
      handleGeneratePalette,
      handleFontSelect,
      handleBrandLogoUpload,
      handleCustomFontChange,
      handleTabChange,
      handleThemeNameBlur,
      handleThemeCompanyNameBlur,
      handleRemoveLogo,
      handlePreviousStep,
      handlePrimaryStepAction,
    },
  }
}
