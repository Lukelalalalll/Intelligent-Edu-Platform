import { Theme, ThemeParams } from '@/app/(presentation-generator)/services/api/types'
import type { CSSProperties } from 'react'
import type { TranslationKey } from '@/shared/i18n'
import {
  FALLBACK_THEME,
  PREVIEW_BASE_WIDTH,
  DEFAULT_THEMES,
  PREVIEW_FALLBACK_SCALE,
  PREVIEW_MAX_SCALE,
  PREVIEW_MIN_SCALE,
  PREVIEW_SCROLLBAR_WIDTH,
  PREVIEW_VIEWPORT_GUTTER,
} from './constants'
import { ThemeColors, ThemeEditorValues, ThemeFonts } from './types'

type ThemeTranslator = (
  key: TranslationKey,
  vars?: Record<string, string | number>
) => string

type ThemeCustomizationOptions = {
  colors: ThemeColors
  fonts: ThemeFonts
  brandLogo: string | null
  companyName: string
}

type BuildThemeParamsOptions = ThemeCustomizationOptions & {
  theme: Theme
  brandLogoId: string | null
  includeId?: boolean
}

export function joinClassNames(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function normalizeTheme(theme: Theme): Theme {
  return {
    ...theme,
    user: theme.user || 'system',
    logo: theme.logo ?? '',
    logo_url: theme.logo_url ?? '',
    company_name: theme.company_name ?? '',
  }
}

function getBuiltInThemeTranslationKey(
  themeId: string,
  field: 'name' | 'description'
): TranslationKey {
  return `ppt_generator.theme.builtIn.${themeId}.${field}` as TranslationKey
}

function localizeBuiltInTheme(theme: Theme, t: ThemeTranslator): Theme {
  if (theme.user !== 'system') {
    return theme
  }

  return {
    ...theme,
    name: t(getBuiltInThemeTranslationKey(theme.id, 'name')),
    description: t(getBuiltInThemeTranslationKey(theme.id, 'description')),
  }
}

export function getDefaultThemes(t: ThemeTranslator): Theme[] {
  return DEFAULT_THEMES.map((theme) => localizeBuiltInTheme(normalizeTheme(theme), t))
}

export function extractThemeEditorValues(theme: Theme): ThemeEditorValues {
  return {
    colors: theme.data.colors,
    fonts: theme.data.fonts,
    brandLogo: theme.logo_url || '',
    brandLogoId: theme.logo || '',
    companyName: theme.company_name || '',
  }
}

export function buildThemeWithCustomizations(
  theme: Theme,
  { colors, fonts, brandLogo, companyName }: ThemeCustomizationOptions
): Theme {
  return {
    ...theme,
    logo_url: brandLogo || theme.logo_url,
    company_name: companyName || theme.company_name,
    data: {
      ...theme.data,
      colors,
      fonts,
    },
  }
}

export function applyThemeToElement(element: HTMLElement, theme: Theme) {
  const cssVariables = buildThemeCssVariables(theme)

  Object.entries(cssVariables).forEach(([key, value]) => {
    if (key === 'fontFamily') {
      element.style.setProperty('font-family', value)
      return
    }
    element.style.setProperty(key, value)
  })
}

export function buildThemeCssVariables(theme: Theme): CSSProperties & Record<string, string> {
  const fontFamily = `"${theme.data.fonts.textFont.name}"`

  return {
    '--primary-color': theme.data.colors.primary,
    '--background-color': theme.data.colors.background,
    '--page-background-color': theme.data.colors.background,
    '--card-color': theme.data.colors.card,
    '--stroke': theme.data.colors.stroke,
    '--primary-text': theme.data.colors.primary_text,
    '--background-text': theme.data.colors.background_text,
    '--graph-0': theme.data.colors.graph_0,
    '--graph-1': theme.data.colors.graph_1,
    '--graph-2': theme.data.colors.graph_2,
    '--graph-3': theme.data.colors.graph_3,
    '--graph-4': theme.data.colors.graph_4,
    '--graph-5': theme.data.colors.graph_5,
    '--graph-6': theme.data.colors.graph_6,
    '--graph-7': theme.data.colors.graph_7,
    '--graph-8': theme.data.colors.graph_8,
    '--graph-9': theme.data.colors.graph_9,
    '--heading-font-family': fontFamily,
    '--body-font-family': fontFamily,
    fontFamily,
  }
}

export function mapGeneratedThemeColors(generatedTheme: Record<string, string>): ThemeColors {
  return {
    primary: generatedTheme.primary,
    background: generatedTheme.background,
    card: generatedTheme.card,
    stroke: generatedTheme.stroke,
    primary_text: generatedTheme.primary_text,
    background_text: generatedTheme.background_text,
    graph_0: generatedTheme.graph_0,
    graph_1: generatedTheme.graph_1,
    graph_2: generatedTheme.graph_2,
    graph_3: generatedTheme.graph_3,
    graph_4: generatedTheme.graph_4,
    graph_5: generatedTheme.graph_5,
    graph_6: generatedTheme.graph_6,
    graph_7: generatedTheme.graph_7,
    graph_8: generatedTheme.graph_8,
    graph_9: generatedTheme.graph_9,
  }
}

export function createNewCustomThemeDraft(t: ThemeTranslator): Theme {
  return {
    id: `custom-${Date.now()}`,
    name: t('ppt_generator.theme.defaults.newThemeName'),
    description: t('ppt_generator.theme.defaults.newThemeDescription'),
    user: 'local',
    logo: '',
    logo_url: '',
    company_name: '',
    data: {
      colors: {
        primary: '#0000c3',
        background: '#f1fff3',
        card: '#deece1',
        stroke: '#c8d5ca',
        primary_text: '#f1f1f1',
        background_text: '#030101',
        graph_0: '#7eeeff',
        graph_1: '#70e0ff',
        graph_2: '#58c7ff',
        graph_3: '#3cabff',
        graph_4: '#198fff',
        graph_5: '#0073ff',
        graph_6: '#0056ff',
        graph_7: '#0036ed',
        graph_8: '#0000d0',
        graph_9: '#0000b4',
      },
      fonts: FALLBACK_THEME.data.fonts,
    },
  }
}

export function buildThemeParams({
  theme,
  colors,
  fonts,
  brandLogo,
  brandLogoId,
  companyName,
  includeId = false,
}: BuildThemeParamsOptions): ThemeParams {
  return {
    ...(includeId ? { id: theme.id } : {}),
    name: theme.name,
    description: includeId
      ? theme.description
      : theme.description || `Custom version of ${theme.name}`,
    logo: brandLogoId || null,
    logo_url: brandLogo || null,
    company_name: companyName || null,
    data: {
      colors,
      fonts,
    },
  }
}

export function calculatePreviewScale(slideContainerWidth: number) {
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
}

export function getThemeSource(theme: Theme) {
  return theme.user === 'system' ? 'built_in' : 'custom'
}

export function isPersistedCustomTheme(theme: Theme) {
  return Boolean(theme.user && theme.user !== 'system' && !theme.id.startsWith('custom-'))
}
