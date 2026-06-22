'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  SquarePen,
  RefreshCcw,
  ChevronRight,
  Plus,
  LayoutDashboard,
  Palette,
  PanelTop,
  Sparkles
} from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'


import { ThemeColors } from './types'
import { FONT_OPTIONS, DEFAULT_THEMES } from './constants'


import { StepIndicator } from './StepIndicator'
import { ColorPickerComponent } from './ColorPickerComponent'
import { FontCard } from './FontCard'
import { ThemeCard } from './ThemeCard'

import { notify } from '@/components/ui/sonner'
import { Theme, ThemeParams } from '@/app/(presentation-generator)/services/api/types'
import { ImagesApi } from '@/app/(presentation-generator)/services/api/images'
import { Input } from '@/components/ui/input'
import { getTemplatesByTemplateName } from '@/app/presentation-templates'
import { usePathname, useRouter, useSearchParams } from '@/presenton/shims/next-navigation'
import CustomTabEmpty from './CustomTabEmpty'
import ThemeApi from '@/app/(presentation-generator)/services/api/theme'
import { useFontLoader } from '@/app/(presentation-generator)/hooks/useFontLoad'
import Link from '@/presenton/shims/next-link'
import { MixpanelEvent, trackEvent } from '@/utils/mixpanel'
import WorkspaceCard from '@/shared/components/Card/Card'
import WelcomeBanner from '@/shared/components/WelcomeBanner'
import styles from './ThemePanel.module.css'

// Fallback theme used before defaults are loaded from API (unified Theme type)
const FALLBACK_THEME: Theme = {
  id: 'standard',
  name: 'Standard',
  description: 'Standard theme',
  user: 'system',
  logo: '',
  logo_url: '',
  data: {
    colors: {
      'primary': '#2563eb',
      'background': '#ffffff',
      'card': '#f8fafc',
      'stroke': '#e5e7eb',
      'primary_text': '#1e293b',
      'background_text': '#475569',
      'graph_0': '#2563eb',
      'graph_1': '#1d4ed8',
      'graph_2': '#1e40af',
      'graph_3': '#1e40af',
      'graph_4': '#1e40af',
      'graph_5': '#1e40af',
      'graph_6': '#1e40af',
      'graph_7': '#1e40af',
      'graph_8': '#1e40af',
      'graph_9': '#1e40af',
    },
    fonts: {
      textFont: { name: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap' },
    },
  },
}

type ThemeTab = 'custom' | 'default'

const PREVIEW_BASE_WIDTH = 1280
const PREVIEW_BASE_HEIGHT = 720
const PREVIEW_VIEWPORT_GUTTER = 40
const PREVIEW_SCROLLBAR_WIDTH = 8
const PREVIEW_FALLBACK_SCALE = 0.62
const PREVIEW_MIN_SCALE = 0.42
const PREVIEW_MAX_SCALE = 0.74

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

const STEP_META: Record<number, { title: string; description: string }> = {
  1: {
    title: 'Anchor the brand colors',
    description: 'Pick the primary and background pair that drives the palette direction.',
  },
  2: {
    title: 'Tune the full palette',
    description: 'Refine text, card, and chart colors while the preview updates live.',
  },
  3: {
    title: 'Choose the type system',
    description: 'Upload a brand font or select one of the shared presets for the deck voice.',
  },
  4: {
    title: 'Add brand identity',
    description: 'Set the company name and logo that should travel with this custom theme.',
  },
}

function joinClassNames(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
const ThemePanel: React.FC = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const newThemeTab = searchParams.get('tab')


  const [selectedTheme, setSelectedTheme] = useState<Theme>(FALLBACK_THEME)
  const [tab, setTab] = useState<ThemeTab>('default')

  const [customColors, setCustomColors] = useState<ThemeColors>(FALLBACK_THEME.data.colors)
  const [customFonts, setCustomFonts] = useState<{ textFont: { name: string, url: string } }>(FALLBACK_THEME.data.fonts)
  const [customBrandLogo, setCustomBrandLogo] = useState<string | null>(null)
  const [customBrandLogoId, setCustomBrandLogoId] = useState<string | null>(null)
  const [isLogoUploading, setIsLogoUploading] = useState<boolean>(false)
  const [isFontUploading, setIsFontUploading] = useState<boolean>(false)
  const [customThemes, setCustomThemes] = useState<Theme[]>([])
  const [defaultThemes, setDefaultThemes] = useState<Theme[]>([])
  const [isCustomThemesLoading, setIsCustomThemesLoading] = useState(true)
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [themeCompanyName, setThemeCompanyName] = useState('')
  const [isNewTheme, setIsNewTheme] = useState(false)
  const [userFonts, setUserFonts] = useState<{ fonts: { name: string, url: string }[] }>({ fonts: [] })

  const previewContainerRef = useRef<HTMLDivElement>(null)
  const slideContainerRef = useRef<HTMLDivElement>(null)
  const [slideContainerWidth, setSlideContainerWidth] = useState<number>(0)
  const currentStepMeta = STEP_META[currentStep]
  const activeTabDescription = tab === 'default'
    ? 'Browse built-in themes from the shared Presenton library, then open one to customize and save as your own.'
    : 'Reopen saved custom themes or start a fresh brand direction without leaving the Presenton workspace.'
  const totalThemeCount = defaultThemes.length + customThemes.length
  const activeThemeCount = tab === 'default' ? defaultThemes.length : customThemes.length

  useEffect(() => {
    trackEvent(MixpanelEvent.Theme_Page_Viewed, { pathname })
  }, [pathname])

  const previewScale = useMemo(() => {
    if (!slideContainerWidth) return PREVIEW_FALLBACK_SCALE
    const availableWidth = Math.max(
      slideContainerWidth - PREVIEW_VIEWPORT_GUTTER - PREVIEW_SCROLLBAR_WIDTH,
      0
    )
    if (!availableWidth) return PREVIEW_FALLBACK_SCALE
    return Math.max(
      PREVIEW_MIN_SCALE,
      Math.min(availableWidth / PREVIEW_BASE_WIDTH, PREVIEW_MAX_SCALE)
    )
  }, [slideContainerWidth])
  const previewSlideHeight = PREVIEW_BASE_HEIGHT * previewScale
  const previewSlideWidth = PREVIEW_BASE_WIDTH * previewScale

  useEffect(() => {
    const el = slideContainerRef.current
    if (!el) return

    const ro = new ResizeObserver(() => {
      setSlideContainerWidth(el.clientWidth)
    })
    ro.observe(el)
    setSlideContainerWidth(el.clientWidth)

    return () => ro.disconnect()
  }, [isSheetOpen, slideContainerRef])



  const handleCloseSheet = (open: boolean) => {
    setIsSheetOpen(open)
    if (!open) {
      router.replace('/theme')
    }
  }

  // Initialize theme on component mount
  useEffect(() => {
    applyTheme(selectedTheme)
  }, [])

  // Load custom themes from API and built-in themes from local constants
  useEffect(() => {

    const loadCustomThemes = async () => {
      try {
        const apiThemes = await ThemeApi.getThemes()
        setCustomThemes(apiThemes)
        const fonts = apiThemes.map(theme => theme.data.fonts.textFont)

        const fontMap = fonts.map(font => ({ name: font.name, url: font.url }))
        fontMap.forEach(font => {
          useFontLoader({ [font.name]: font.url })
        })
      } catch (error: any) {
        console.error('Failed to load custom themes', error)
        notify.error(
          'Could not load themes',
          error?.message || 'Your saved themes could not be loaded. Built-in themes are still available.'
        )
      } finally {
        setIsCustomThemesLoading(false)
      }
    }
    const loadUserFonts = async () => {
      try {
        const userFonts = await ThemeApi.getUserFonts()
        setUserFonts(userFonts)
      } catch (error: any) {
        console.error('Failed to load user fonts', error)
        notify.error(
          'Could not load fonts',
          error?.message || 'Your uploaded fonts could not be loaded right now.'
        )
      }
    }
    loadUserFonts()
    const loadDefaultThemes = () => {
      const localDefaults: Theme[] = DEFAULT_THEMES.map((theme) => ({
        ...theme,
        user: 'system',
        logo: theme.logo ?? '',
        logo_url: theme.logo_url ?? '',
        company_name: theme.company_name ?? '',
      }))

      setDefaultThemes(localDefaults)

      // If selected theme is still fallback, set first default
      if (localDefaults.length > 0 && selectedTheme.id === FALLBACK_THEME.id) {
        const first = localDefaults[0]
        setSelectedTheme(first)
        setCustomColors(first.data.colors)
        setCustomFonts(first.data.fonts)
        setCustomBrandLogo(first.logo_url || null)
        setCustomBrandLogoId((first as any).logo || '')
        applyTheme(first)
      }
    }
    loadCustomThemes()
    loadDefaultThemes()
  }, [])


  useEffect(() => {
    const updatedTheme: Theme = {
      ...selectedTheme,
      logo_url: customBrandLogo || selectedTheme.logo_url,
      company_name: themeCompanyName || selectedTheme.company_name,
      data: {
        ...selectedTheme.data,
        colors: customColors,
        fonts: customFonts,
      },
    }
    applyTheme(updatedTheme)
  }, [customColors, customFonts, customBrandLogo, selectedTheme])

  // Reset custom values only when the selected theme ID changes
  useEffect(() => {
    if (selectedTheme) {
      setCustomColors(selectedTheme.data.colors)
      setCustomFonts(selectedTheme.data.fonts)
      setCustomBrandLogo(selectedTheme.logo_url || '')
      setCustomBrandLogoId((selectedTheme as any).logo || '')

    }
  }, [selectedTheme.id])



  const template = getTemplatesByTemplateName('neo-general')
  const applyTheme = (theme: Theme) => {
    const cssVariables = {
      '--primary-color': theme.data.colors['primary'],
      '--background-color': theme.data.colors['background'],
      '--card-color': theme.data.colors['card'],
      '--stroke': theme.data.colors['stroke'],
      '--primary-text': theme.data.colors['primary_text'],
      '--background-text': theme.data.colors['background_text'],
      '--graph-0': theme.data.colors['graph_0'],
      '--graph-1': theme.data.colors['graph_1'],
      '--graph-2': theme.data.colors['graph_2'],
      '--graph-3': theme.data.colors['graph_3'],
      '--graph-4': theme.data.colors['graph_4'],
      '--graph-5': theme.data.colors['graph_5'],
      '--graph-6': theme.data.colors['graph_6'],
      '--graph-7': theme.data.colors['graph_7'],
      '--graph-8': theme.data.colors['graph_8'],
      '--graph-9': theme.data.colors['graph_9'],
    }



    // Apply theme to preview container
    if (slideContainerRef.current) {

      Object.entries(cssVariables).forEach(([key, value]) => {
        slideContainerRef.current!.style.setProperty(key, value)
      })

      // Apply fonts to preview container
      slideContainerRef.current!.style.setProperty('font-family', `"${theme.data.fonts.textFont.name}"`)
      slideContainerRef.current!.style.setProperty('--heading-font-family', `"${theme.data.fonts.textFont.name}"`)
      // Load font
      useFontLoader({ [theme.data.fonts.textFont.name]: theme.data.fonts.textFont.url })
    }
  }

  const handleThemeSelect = (theme: Theme) => {
    setIsNewTheme(false)
    setSelectedTheme(theme)
    setCustomColors(theme.data.colors)
    setCustomFonts(theme.data.fonts)
    setCustomBrandLogo(theme.logo_url || '')
    setIsSheetOpen(true)
    setCurrentStep(1)

    setThemeCompanyName(theme.company_name || '')
    applyTheme(theme)
    trackEvent(MixpanelEvent.Theme_Selected, {
      pathname,
      theme_id: theme.id,
      theme_name: theme.name,
      theme_source: theme.user === 'system' ? 'built_in' : 'custom',
    })
    trackEvent(MixpanelEvent.Theme_Editor_Opened, {
      pathname,
      theme_id: theme.id,
      theme_name: theme.name,
      theme_source: theme.user === 'system' ? 'built_in' : 'custom',
    })
  }

  const handleColorChange = (colorKey: keyof ThemeColors, value: string) => {
    let validValue = value
    if (value && !value.startsWith('#')) {
      validValue = `#${value}`
    }

    const newColors = { ...customColors, [colorKey]: validValue }
    setCustomColors(newColors)
  }

  const handleFontSelect = (fontName: string, url: string) => {
    setCustomFonts({ textFont: { name: fontName, url: url } })
    trackEvent(MixpanelEvent.Theme_Font_Changed, {
      pathname,
      font_name: fontName,
      font_url: url,
      theme_id: selectedTheme.id,
    })
  }

  const handleBrandLogoUpload = async (file: File) => {
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
  }

  const generateTheme = async ({
    primary,
    background,
    source,
  }: { primary?: string, background?: string; source: "new_theme" | "refresh" }): Promise<ThemeColors> => {
    const generatedTheme = await ThemeApi.generateTheme({ primary, background })
    trackEvent(MixpanelEvent.Theme_Palette_Generated, {
      pathname,
      source,
      theme_id: selectedTheme.id,
      has_primary_seed: Boolean(primary),
      has_background_seed: Boolean(background),
    })
    return {
      'primary': generatedTheme.primary,
      'background': generatedTheme.background,
      'card': generatedTheme.card,
      'stroke': generatedTheme.stroke,
      'primary_text': generatedTheme['primary_text'],
      'background_text': generatedTheme['background_text'],
      'graph_0': generatedTheme['graph_0'],
      'graph_1': generatedTheme['graph_1'],
      'graph_2': generatedTheme['graph_2'],
      'graph_3': generatedTheme['graph_3'],
      'graph_4': generatedTheme['graph_4'],
      'graph_5': generatedTheme['graph_5'],
      'graph_6': generatedTheme['graph_6'],
      'graph_7': generatedTheme['graph_7'],
      'graph_8': generatedTheme['graph_8'],
      'graph_9': generatedTheme['graph_9'],
    }
  }

  const createNewCustomTheme = async () => {
    trackEvent(MixpanelEvent.Theme_New_Theme_Clicked, { pathname })
    setIsNewTheme(true)
    const newTheme: Theme = {
      id: `custom-${Date.now()}`,
      name: 'New Custom Theme',
      description: 'Start with a blank canvas',
      user: 'local',
      logo: '',
      logo_url: '',
      company_name: '',
      data: {
        colors: {
          'primary': '#0000c3',
          'background': '#f1fff3',
          'card': '#deece1',
          'stroke': '#c8d5ca',
          'primary_text': '#f1f1f1',
          'background_text': '#030101',
          'graph_0': '#7eeeff',
          'graph_1': '#70e0ff',
          'graph_2': '#58c7ff',
          'graph_3': '#3cabff',
          'graph_4': '#198fff',
          'graph_5': '#0073ff',
          'graph_6': '#0056ff',
          'graph_7': '#0036ed',
          'graph_8': '#0000d0',
          'graph_9': '#0000b4',
        },
        fonts: {
          textFont: { name: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap' },
        }
      }
    }

    const generatedColors = await generateTheme({ source: "new_theme" })


    const theme = {
      ...newTheme,
      data: {
        ...newTheme.data,
        colors: generatedColors,

      }
    }
    setSelectedTheme(theme)
    setCustomColors(theme.data.colors)
    setCustomFonts(theme.data.fonts)
    setCustomBrandLogo('')
    setIsSheetOpen(true)
    setCurrentStep(1)

    setThemeCompanyName('')
    applyTheme(theme)
    trackEvent(MixpanelEvent.Theme_Editor_Opened, {
      pathname,
      theme_id: theme.id,
      theme_name: theme.name,
      theme_source: "new_draft",
    })
  }

  const refeshTheme = async ({ primary, background }: { primary?: string, background?: string }) => {
    const generatedTheme = await generateTheme({ primary, background, source: "refresh" })
    setCustomColors(generatedTheme)
  }
  const saveAsCustom = async () => {
    // If existing persisted custom theme, update via API (non-system and not a local draft)
    if (selectedTheme.user && selectedTheme.user !== 'system' && !selectedTheme.id.startsWith('custom-')) {
      ; (async () => {
        try {
          trackEvent(MixpanelEvent.Theme_Save_Started, {
            pathname,
            mode: "update",
            theme_id: selectedTheme.id,
            theme_name: selectedTheme.name,
          })
          const params: ThemeParams = {
            id: selectedTheme.id,
            name: selectedTheme.name,
            description: selectedTheme.description,
            logo: customBrandLogoId || null,
            logo_url: customBrandLogo || null,
            company_name: themeCompanyName || null,
            data: {
              colors: customColors,
              fonts: customFonts,
            }
          }
          const updated = await ThemeApi.updateTheme(params)
          setCustomThemes(customThemes.map(t => t.id === updated.id ? updated : t))
          setSelectedTheme(updated)
          setIsSheetOpen(false)
          trackEvent(MixpanelEvent.Theme_Saved, {
            pathname,
            mode: "update",
            theme_id: updated.id,
            theme_name: updated.name,
            has_logo: Boolean(updated.logo_url),
            font_name: updated.data?.fonts?.textFont?.name || "",
          })
          notify.success('Theme updated', 'Your theme changes were saved.')
        } catch (error: any) {
          console.error('Failed to update theme', error)
          notify.error(
            'Could not update theme',
            error?.message || 'Something went wrong while saving your theme changes.'
          )
        }
      })()
      return
    }
    try {
      trackEvent(MixpanelEvent.Theme_Save_Started, {
        pathname,
        mode: "create",
        theme_id: selectedTheme.id,
        theme_name: selectedTheme.name,
      })
      const params: ThemeParams = {
        name: selectedTheme.name,
        description: selectedTheme.description || `Custom version of ${selectedTheme.name}`,
        logo: customBrandLogoId || null,
        logo_url: customBrandLogo || null,
        company_name: themeCompanyName || null,
        data: {
          colors: customColors,
          fonts: customFonts,
        }
      }
      const created = await ThemeApi.createTheme(params)
      setCustomThemes([...customThemes, created])
      setSelectedTheme(created)
      setIsSheetOpen(false)


      router.replace('/theme')
      trackEvent(MixpanelEvent.Theme_Saved, {
        pathname,
        mode: "create",
        theme_id: created.id,
        theme_name: created.name,
        has_logo: Boolean(created.logo_url),
        font_name: created.data?.fonts?.textFont?.name || "",
      })
      notify.success('Theme saved', 'Your new theme was created and is ready to use.')
    } catch (error: any) {
      console.error('Failed to save theme', error)
      notify.error(
        'Could not save theme',
        error?.message || 'Something went wrong while creating your theme.'
      )
    }
  }

  const handleClickOutside = () => {
    setShowColorPicker(null)
  }
  const handleDelete = async (themeId: string) => {
    try {
      await ThemeApi.deleteTheme(themeId)
      setCustomThemes(customThemes.filter(theme => theme.id !== themeId))
      trackEvent(MixpanelEvent.Theme_Deleted, {
        pathname,
        theme_id: themeId,
      })
      notify.success("Theme deleted", "The theme was removed from your library.")
    } catch (error: any) {
      console.error('Failed to delete theme', error)
      notify.error(
        'Could not delete theme',
        error?.message || 'Something went wrong while deleting the theme.'
      )
    }
  }
  const handleCustomFontChange = async (fontFile: File) => {
    try {
      setIsFontUploading(true)
      const { font_name, font_url } = await ThemeApi.uploadFont(fontFile)
      setCustomFonts({
        textFont: {
          name: font_name,
          url: font_url,
        }
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
        font_name: font_name,
        font_url: font_url,
        source: "uploaded_font",
      })
      // Add the newly uploaded font to userFonts if not already present
      if (!userFonts.fonts.find(f => f.name === font_name)) {
        setUserFonts(prev => ({
          fonts: [...prev.fonts, { name: font_name, url: font_url }]
        }))
      }
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
  }
  const renderColorStep = (step: number) => (
    <div className={styles.stepScrollable}
      style={{
        paddingInline: step === 1 ? '20px' : '10px'
      }}
    >
      <Label className={styles.stepHeading}>

        {step === 1 ? 'Brand Colors' : 'Palette'}
        <RefreshCcw onClick={() => refeshTheme(step === 1 ? {

        } : {
          primary: customColors['primary'],
          background: customColors['background'],
        })} className={styles.stepRefresh} />
      </Label>
      <div className="space-y-4">


        <div className={joinClassNames([styles.stepCard, step === 2 && styles.stepCardMuted])}>

          {step === 2 && <p className={styles.stepSectionCaption}>Brand Colors</p>}
          <div className="space-y-4"
            style={{
              padding: step === 2 ? '10px' : '0px',
              backgroundColor: 'transparent'
            }}
          >
            <ColorPickerComponent
              colorKey="primary"
              label="Primary Color"
              currentColor={customColors['primary']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="background"
              label="Background Color"
              currentColor={customColors['background']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
          </div>
        </div>
        {step === 2 && <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>Text Colors</p>
          <div className="space-y-4"
            style={{
              padding: step === 2 ? '10px' : '0px',
              backgroundColor: 'transparent'
            }}
          >
            <ColorPickerComponent
              colorKey="background_text"
              label="Background Text"
              currentColor={customColors['background_text']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="primary_text"
              label="Primary Text"
              currentColor={customColors['primary_text']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
          </div>
        </div>}
        {step === 2 && <div className={styles.stepCard}>
          <ColorPickerComponent
            colorKey="card"
            label="Card Color"
            currentColor={customColors['card']}
            onColorChange={handleColorChange}
            showColorPicker={showColorPicker}
            onShowColorPicker={setShowColorPicker}
          />
        </div>}
        {step === 2 && <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>Graph/Chart Colors</p>
          <div className="space-y-4"
            style={{
              padding: step === 2 ? '10px' : '0px',
              backgroundColor: 'transparent'
            }}
          >
            <ColorPickerComponent
              colorKey="graph_0"
              label=""
              currentColor={customColors['graph_0']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_1"
              label=""
              currentColor={customColors['graph_1']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_2"
              label=""
              currentColor={customColors['graph_2']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_3"
              label=""
              currentColor={customColors['graph_3']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_4"
              label=""
              currentColor={customColors['graph_4']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_5"
              label=""
              currentColor={customColors['graph_5']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_6"
              label=""
              currentColor={customColors['graph_6']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_7"
              label=""
              currentColor={customColors['graph_7']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_8"
              label=""
              currentColor={customColors['graph_8']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />
            <ColorPickerComponent
              colorKey="graph_9"
              label=""
              currentColor={customColors['graph_9']}
              onColorChange={handleColorChange}
              showColorPicker={showColorPicker}
              onShowColorPicker={setShowColorPicker}
            />

          </div>
        </div>}
      </div>


    </div>
  )

  const renderFontStep = () => (
    <div className={joinClassNames([styles.stepScrollable, styles.stepStack])}
      style={{
        paddingInline: '10px'
      }}
    >
      <Label className={joinClassNames([styles.stepHeading, styles.stepHeadingInset])}>
        Typography
      </Label>




      {/* Upload Custom Font */}
      <div className={styles.stepCard}>
        <p className={styles.stepSectionCaption}>Upload Custom Font</p>
        <div
          className={`p-3 rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer group
            ${isFontUploading
              ? 'bg-[#F8F7FF] border-[#7A5AF8]'
              : 'bg-[#F9FAFB] border-[#E0E0E0] '
            }`}
          onClick={() => {
            if (!isFontUploading) {
              document.getElementById('font-upload')?.click()
            }
          }}
          role="button"
          tabIndex={0}
        >
          {isFontUploading ? (
            <div className='flex items-center gap-3'>
              <div className='w-10 h-10 rounded-lg bg-[#EBE9FE] flex items-center justify-center'>
                <Loader2 className='w-5 h-5 text-[#7A5AF8] animate-spin' />
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium text-[#7A5AF8]'>Uploading font...</p>
                <p className='text-xs text-[#888]'>Please wait</p>
              </div>
            </div>
          ) : (
            <div className='flex items-center gap-3'>
              <div className='w-10 h-10 rounded-lg bg-[#EBE9FE] flex items-center justify-center group-hover:bg-[#DDD8FD] transition-colors'>
                <Plus className='w-5 h-5 text-[#7A5AF8]' />
              </div>
              <div className='flex-1'>
                <p className='text-sm font-medium text-[#151515]'>Upload Font File</p>
                <p className='text-xs text-[#888]'>.ttf, .otf, .woff, .woff2</p>
              </div>
              <ChevronRight className='w-4 h-4 text-[#999] group-hover:text-[#7A5AF8] transition-colors' />
            </div>
          )}
        </div>
        <input
          type="file"
          accept=".ttf,.otf,.woff,.woff2,.eot"
          className="w-full h-full hidden"
          id="font-upload"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) {
              await handleCustomFontChange(file)
            }
          }}
        />
      </div>

      {/* User's Uploaded Fonts */}
      {userFonts.fonts.length > 0 && (
        <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
          <p className={styles.stepSectionCaption}>Your Uploaded Fonts</p>
          <div className='grid grid-cols-2 gap-2'>
            {userFonts.fonts?.map((font) => (
              <FontCard
                key={font.name}
                font={{
                  name: font.name,
                  displayName: font.name,
                }}
                isSelected={customFonts.textFont.name === font.name}
                onSelect={() => handleFontSelect(font.name, font.url)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preset Fonts */}
      <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
        <p className={styles.stepSectionCaption}>Pre-Sets</p>
        <div className="grid grid-cols-2 gap-2 overflow-y-auto custom_scrollbar">
          {FONT_OPTIONS.map((font) => (
            <FontCard
              key={font.name}
              font={font}
              isSelected={customFonts.textFont.name === font.name}
              onSelect={() => handleFontSelect(font.name, font.cssUrl)}
            />
          ))}
        </div>
      </div>
    </div>
  )

  const renderLogoStep = () => (
    <div className={joinClassNames([styles.stepScrollable, styles.stepStack, styles.logoStep])}>
      <Label className={styles.stepHeading}>

        Logo
        {/* <RefreshCcw className='w-5 h-5 text-[#808080] hover:text-[#191919] duration-300 transition-all cursor-pointer' /> */}
      </Label>
      <div className={styles.stepCard}>
        <Label className={styles.stepFieldLabel}>

          Company Name
        </Label>
        <Input
          defaultValue={themeCompanyName}
          placeholder="Enter company name"
          onBlur={(e) => setThemeCompanyName(e.target.value)}
        />
      </div>
      <div className={joinClassNames([styles.stepCard, styles.stepCardMuted])}>
      <Label className={styles.stepFieldLabel}>

        Brand Logo
      </Label>

      <div className="space-y-2 bg-[#F6F6F9] rounded-md p-1 cursor-pointer"
        onClick={(e) => {

          e.stopPropagation()
          document.getElementById('logo-upload')?.click()
        }}

        role="button"
        tabIndex={0}
      >

        <div className="border-2 border-dashed  border-gray-300 rounded-lg p-6 text-center">
          {isLogoUploading ? (
            <div className="flex flex-col items-center justify-center py-6 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-sm">Uploading logo...</p>
            </div>
          ) : customBrandLogo ? (
            <div className="space-y-2">
              <img
                src={customBrandLogo}
                alt="Brand Logo"
                className="mx-auto h-16 w-auto object-contain"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedTheme({ ...selectedTheme, logo_url: '' })
                  setCustomBrandLogo('')
                  setCustomBrandLogoId('')
                }}
              >
                Remove Logo
              </Button>
            </div>
          ) : (
            <>
              <div className='w-[42px] h-[42px] mx-auto flex justify-center items-center rounded-full bg-[#EBE9FE]' >
                <div className='w-[22px] h-[22px] rounded-full bg-[#7A5AF8] flex items-center justify-center text-white'>
                  <Plus className='w-3 h-3' />
                </div>
              </div>
              <div className="mt-2">
                <label htmlFor="logo-upload" className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-500">Click to upload</span>
                  <span className="text-gray-500"> or drag and drop</span>
                </label>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/png, image/jpeg, image/jpg"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      await handleBrandLogoUpload(file)
                    }
                  }}
                />
              </div>

            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )


  // LOOK for new-theme in the url
  useEffect(() => {
    if (newThemeTab === 'new-theme') {
      void createNewCustomTheme()
    }
  }, [newThemeTab])


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
                    onClick={() => {
                      trackEvent(MixpanelEvent.Theme_Tab_Switched, { pathname, tab: 'default' })
                      setTab('default')
                    }}
                  >
                    Built-in
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'custom'}
                    className={joinClassNames([styles.tabButton, tab === 'custom' && styles.tabButtonActive])}
                    onClick={() => {
                      trackEvent(MixpanelEvent.Theme_Tab_Switched, { pathname, tab: 'custom' })
                      setTab('custom')
                    }}
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
                <h2 className={styles.sectionTitle}>
                  {tab === 'default'
                    ? 'Open a foundation theme and shape it into something brand-ready.'
                    : 'Keep saved theme directions close to the next deck you build.'}
                </h2>
                <p className={styles.sectionDescription}>
                  {tab === 'default'
                    ? 'Built-in themes stay grouped in one workspace so you can inspect the palette direction before opening the editor and saving a custom version.'
                    : 'Custom themes keep your saved colors, fonts, and branding within easy reach whenever a new deck needs a familiar visual system.'}
                </p>
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

        <Sheet open={isSheetOpen} onOpenChange={handleCloseSheet}>
          <SheetContent side="bottom" className={styles.sheetContent}>
            <div className={styles.editorShell}>
              <div onClick={handleClickOutside} className={styles.editorPane}>
                <div className={styles.editorHeader}>
                  <div className={styles.editorHeaderCopy}>
                    <span className={styles.editorEyebrow}>
                      {isNewTheme ? 'New custom theme' : selectedTheme.user === 'system' ? 'Customize theme' : 'Edit custom theme'}
                    </span>
                    <div className={styles.editorTitleRow}>
                      <input
                        key={selectedTheme.id}
                        id="theme-name"
                        name="theme-name"
                        className={styles.editorTitleInput}
                        autoFocus={false}
                        defaultValue={selectedTheme.name}
                        onBlur={(e) => setSelectedTheme({ ...selectedTheme, name: e.target.value })}
                      />
                      <button
                        type="button"
                        className={styles.editorIconButton}
                        onClick={() => {
                          document.getElementById('theme-name')?.focus()
                        }}
                        aria-label="Edit theme name"
                      >
                        <SquarePen className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.editorBody}>
                  <StepIndicator currentStep={currentStep} />
                  <div className={styles.stepStage}>
                    <div className={styles.stepIntro}>
                      <h3 className={styles.stepIntroTitle}>{currentStepMeta.title}</h3>
                      <p className={styles.stepIntroText}>{currentStepMeta.description}</p>
                    </div>

                    <div className={styles.stepContent}>
                      {currentStep === 1 && renderColorStep(currentStep)}
                      {currentStep === 2 && renderColorStep(currentStep)}
                      {currentStep === 3 && renderFontStep()}
                      {currentStep === 4 && renderLogoStep()}
                    </div>

                    <div className={styles.editorFooter}>
                      {currentStep > 1 && (
                        <button
                          type="button"
                          className={styles.footerSecondaryAction}
                          onClick={() => setCurrentStep(currentStep - 1)}
                        >
                          Back
                        </button>
                      )}

                      <button
                        type="button"
                        className={styles.footerPrimaryAction}
                        onClick={() => {
                          if (currentStep === 4) {
                            saveAsCustom()
                          }
                          else if (currentStep === 1) {
                            setCurrentStep(currentStep + 1)
                            if (isNewTheme) {
                              refeshTheme({
                                primary: customColors['primary'],
                                background: customColors['background'],
                              })
                            }
                          }
                          else {
                            setCurrentStep(currentStep + 1)
                          }
                        }}
                      >
                        {currentStep === 1 ? 'Generate theme palette' : currentStep === 2 ? 'Continue to Fonts' : currentStep === 3 ? 'Continue to Design' : 'Save as Custom Theme'}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={(el) => {
                  if (el) {
                    (previewContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el
                    const updatedTheme: Theme = {
                      ...selectedTheme,
                      logo_url: customBrandLogo || selectedTheme.logo_url,
                      data: {
                        ...selectedTheme.data,
                        colors: customColors,
                        fonts: customFonts,
                      },
                    }
                    applyTheme(updatedTheme)
                    setSlideContainerWidth(slideContainerRef.current?.clientWidth || 0)
                  }
                }}
                className={styles.previewPane}
              >
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
                              width: PREVIEW_BASE_WIDTH,
                              height: PREVIEW_BASE_HEIGHT,
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
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}

export default ThemePanel

// No mapping helpers needed: using unified API Theme type everywhere
