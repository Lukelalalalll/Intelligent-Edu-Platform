export interface ThemeColors {
  primary: string
  background: string
  card: string
  stroke: string
  primary_text: string
  background_text: string
  graph_0: string
  graph_1: string
  graph_2: string
  graph_3: string
  graph_4: string
  graph_5: string
  graph_6: string
  graph_7: string
  graph_8: string
  graph_9: string
}

export interface ThemeFontDefinition {
  name: string
  url: string
}

export interface ThemeFonts {
  textFont: ThemeFontDefinition
}

export interface ThemeFontOption {
  name: string
  displayName: string
  cssUrl: string
}

export interface UserFontLibrary {
  fonts: ThemeFontDefinition[]
}

export interface ThemeStepMeta {
  title: string
  description: string
}

export interface ThemeEditorValues {
  colors: ThemeColors
  fonts: ThemeFonts
  brandLogo: string
  brandLogoId: string
  companyName: string
}

export type ThemeTab = 'custom' | 'default'
export type ThemePaletteGenerationSource = 'new_theme' | 'refresh'
