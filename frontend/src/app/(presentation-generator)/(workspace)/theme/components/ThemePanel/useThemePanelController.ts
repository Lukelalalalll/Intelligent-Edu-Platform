'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notify } from '@/components/ui/sonner'
import { Theme } from '@/app/(presentation-generator)/services/api/types'
import { ImagesApi } from '@/app/(presentation-generator)/services/api/images'
import ThemeApi from '@/app/(presentation-generator)/services/api/theme'
import { getTemplatesByTemplateName } from '@/app/presentation-templates'
import { usePathname, useRouter, useSearchParams } from '@/presenton/shims/next-navigation'
import { useFontLoader as loadFontAssets } from '@/app/(presentation-generator)/hooks/useFontLoad'
import { MixpanelEvent, trackEvent } from '@/utils/mixpanel'
import {
  FALLBACK_THEME,
  PREVIEW_BASE_HEIGHT,
  PREVIEW_BASE_WIDTH,
  THEME_EDITOR_STEP_META,
} from './constants'
import {
  applyThemeToElement,
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
import {
  ThemeColors,
  ThemeFonts,
  ThemePaletteGenerationSource,
  ThemeTab,
  UserFontLibrary,
} from './types'

type GenerateThemeOptions = {
  primary?: string
  background?: string
  source: ThemePaletteGenerationSource
}

export function useThemePanelController() {
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
  const [defaultThemes, setDefaultThemes] = useState<Theme[]>([])
  const [isCustomThemesLoading, setIsCustomThemesLoading] = useState(true)
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [themeCompanyName, setThemeCompanyName] = useState('')
  const [isNewTheme, setIsNewTheme] = useState(false)
  const [userFonts, setUserFonts] = useState<UserFontLibrary>({ fonts: [] })
  const [slideContainerWidth, setSlideContainerWidth] = useState(0)

  const slideContainerRef = useRef<HTMLDivElement>(null)
  const previousSelectedThemeIdRef = useRef(selectedTheme.id)

  const currentStepMeta = THEME_EDITOR_STEP_META[currentStep]
  const activeTabDescription = tab === 'default'
    ? 'Browse built-in themes from the shared Presenton library, then open one to customize and save as your own.'
    : 'Reopen saved custom themes or start a fresh brand direction without leaving the Presenton workspace.'
  const totalThemeCount = defaultThemes.length + customThemes.length
  const activeThemeCount = tab === 'default' ? defaultThemes.length : customThemes.length
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
  const template = useMemo(() => getTemplatesByTemplateName('neo-general'), [])

  const applyPreviewTheme = useCallback((theme: Theme) => {
    if (!slideContainerRef.current) return

    applyThemeToElement(slideContainerRef.current, theme)
    loadFontAssets({
      [theme.data.fonts.textFont.name]: theme.data.fonts.textFont.url,
    })
  }, [])

  useEffect(() => {
    trackEvent(MixpanelEvent.Theme_Page_Viewed, { pathname })
  }, [pathname])

  useEffect(() => {
    const element = slideContainerRef.current
    if (!element) return

    const resizeObserver = new ResizeObserver(() => {
      setSlideContainerWidth(element.clientWidth)
    })

    resizeObserver.observe(element)
    setSlideContainerWidth(element.clientWidth)

    return () => resizeObserver.disconnect()
  }, [isSheetOpen])

  useEffect(() => {
    if (!isSheetOpen) return

    applyPreviewTheme(previewTheme)
    setSlideContainerWidth(slideContainerRef.current?.clientWidth || 0)
  }, [applyPreviewTheme, isSheetOpen, previewTheme])

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
          'Could not load themes',
          error?.message || 'Your saved themes could not be loaded. Built-in themes are still available.'
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
          'Could not load fonts',
          error?.message || 'Your uploaded fonts could not be loaded right now.'
        )
      }
    }

    const localDefaults = getDefaultThemes()
    setDefaultThemes(localDefaults)

    if (localDefaults.length > 0 && shouldHydrateDefaultThemeRef.current) {
      const firstTheme = localDefaults[0]
      const editorValues = extractThemeEditorValues(firstTheme)

      shouldHydrateDefaultThemeRef.current = false
      setSelectedTheme(firstTheme)
      setCustomColors(editorValues.colors)
      setCustomFonts(editorValues.fonts)
      setCustomBrandLogo(editorValues.brandLogo)
      setCustomBrandLogoId(editorValues.brandLogoId)
      applyPreviewTheme(firstTheme)
    }

    void loadCustomThemes()
    void loadUserFonts()

    return () => {
      isCancelled = true
    }
  }, [applyPreviewTheme])

  useEffect(() => {
    if (previousSelectedThemeIdRef.current === selectedTheme.id) return

    previousSelectedThemeIdRef.current = selectedTheme.id
    const editorValues = extractThemeEditorValues(selectedTheme)
    setCustomColors(editorValues.colors)
    setCustomFonts(editorValues.fonts)
    setCustomBrandLogo(editorValues.brandLogo)
    setCustomBrandLogoId(editorValues.brandLogoId)
  }, [selectedTheme])

  const handleCloseSheet = useCallback((open: boolean) => {
    setIsSheetOpen(open)
    if (!open) {
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
    setCurrentStep(1)
    applyPreviewTheme(theme)

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
  }, [applyPreviewTheme, pathname])

  const handleColorChange = useCallback((colorKey: keyof ThemeColors, value: string) => {
    const validValue = value && !value.startsWith('#') ? `#${value}` : value
    setCustomColors((currentColors) => ({
      ...currentColors,
      [colorKey]: validValue,
    }))
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
        'Could not upload logo',
        error?.message || 'Something went wrong while uploading your logo. Please try again.'
      )
    } finally {
      setIsLogoUploading(false)
    }
  }, [pathname, selectedTheme.id])

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

    const newTheme = createNewCustomThemeDraft()
    const generatedColors = await generateTheme({ source: 'new_theme' })
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
    setCurrentStep(1)
    setThemeCompanyName('')
    applyPreviewTheme(nextTheme)

    trackEvent(MixpanelEvent.Theme_Editor_Opened, {
      pathname,
      theme_id: nextTheme.id,
      theme_name: nextTheme.name,
      theme_source: 'new_draft',
    })
  }, [applyPreviewTheme, generateTheme, pathname])

  const handleRefreshTheme = useCallback(async ({
    primary,
    background,
  }: {
    primary?: string
    background?: string
  }) => {
    const generatedTheme = await generateTheme({
      primary,
      background,
      source: 'refresh',
    })
    setCustomColors(generatedTheme)
  }, [generateTheme])

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
        trackEvent(MixpanelEvent.Theme_Saved, {
          pathname,
          mode: 'update',
          theme_id: updatedTheme.id,
          theme_name: updatedTheme.name,
          has_logo: Boolean(updatedTheme.logo_url),
          font_name: updatedTheme.data?.fonts?.textFont?.name || '',
        })
        notify.success('Theme updated', 'Your theme changes were saved.')
      } catch (error: any) {
        console.error('Failed to update theme', error)
        notify.error(
          'Could not update theme',
          error?.message || 'Something went wrong while saving your theme changes.'
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
      router.replace('/theme')
      trackEvent(MixpanelEvent.Theme_Saved, {
        pathname,
        mode: 'create',
        theme_id: createdTheme.id,
        theme_name: createdTheme.name,
        has_logo: Boolean(createdTheme.logo_url),
        font_name: createdTheme.data?.fonts?.textFont?.name || '',
      })
      notify.success('Theme saved', 'Your new theme was created and is ready to use.')
    } catch (error: any) {
      console.error('Failed to save theme', error)
      notify.error(
        'Could not save theme',
        error?.message || 'Something went wrong while creating your theme.'
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
      notify.success('Theme deleted', 'The theme was removed from your library.')
    } catch (error: any) {
      console.error('Failed to delete theme', error)
      notify.error(
        'Could not delete theme',
        error?.message || 'Something went wrong while deleting the theme.'
      )
    }
  }, [pathname])

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
        'Font uploaded',
        `Font "${font_name}" is now available for your themes.`
      )
    } catch (error: any) {
      console.error('Failed to upload font', error)
      notify.error(
        'Could not upload font',
        error?.message || 'Something went wrong while uploading the font file.'
      )
    } finally {
      setIsFontUploading(false)
    }
  }, [pathname, selectedTheme.id])

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
    setCurrentStep((step) => Math.max(1, step - 1))
  }, [])

  const handlePrimaryStepAction = useCallback(() => {
    if (currentStep === 4) {
      void saveTheme()
      return
    }

    if (currentStep === 1) {
      setCurrentStep((step) => Math.min(4, step + 1))
      if (isNewTheme) {
        void handleRefreshTheme({
          primary: customColors.primary,
          background: customColors.background,
        })
      }
      return
    }

    setCurrentStep((step) => Math.min(4, step + 1))
  }, [currentStep, customColors.background, customColors.primary, handleRefreshTheme, isNewTheme, saveTheme])

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
    },
    previewState: {
      slideContainerRef,
      previewScale,
      previewSlideWidth,
      previewSlideHeight,
      template,
    },
    actions: {
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
    },
  }
}
