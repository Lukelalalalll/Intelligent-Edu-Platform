import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/shared/i18n'
import { FALLBACK_THEME } from './constants'
import { useThemePanelController } from './useThemePanelController'

const notify = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}))

const themeApi = vi.hoisted(() => ({
  getThemes: vi.fn(),
  getUserFonts: vi.fn(),
  generateTheme: vi.fn(),
  createTheme: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  uploadFont: vi.fn(),
}))

const navigationState = vi.hoisted(() => ({
  router: {
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
  searchParams: new URLSearchParams(),
}))

vi.mock('@/components/ui/sonner', () => ({
  notify,
}))

vi.mock('@/app/(presentation-generator)/services/api/theme', () => ({
  default: themeApi,
}))

vi.mock('@/app/(presentation-generator)/services/api/images', () => ({
  ImagesApi: {
    uploadImage: vi.fn(),
  },
}))

vi.mock('@/ppt_generator/shims/next-navigation', () => ({
  usePathname: () => '/theme',
  useRouter: () => navigationState.router,
  useSearchParams: () => navigationState.searchParams,
}))

vi.mock('@/app/(presentation-generator)/hooks/useFontLoad', () => ({
  useFontLoader: vi.fn(),
}))

vi.mock('@/utils/mixpanel', () => ({
  MixpanelEvent: {
    Theme_Page_Viewed: 'Theme Page Viewed',
    Theme_Selected: 'Theme Selected',
    Theme_Editor_Opened: 'Theme Editor Opened',
    Theme_Palette_Generated: 'Theme Palette Generated',
    Theme_Save_Started: 'Theme Save Started',
    Theme_Saved: 'Theme Saved',
    Theme_Deleted: 'Theme Deleted',
    Theme_Font_Changed: 'Theme Font Changed',
    Theme_Logo_Uploaded: 'Theme Logo Uploaded',
    Theme_Custom_Font_Uploaded: 'Theme Custom Font Uploaded',
    Theme_Tab_Switched: 'Theme Tab Switched',
    Theme_New_Theme_Clicked: 'Theme New Theme Clicked',
  },
  trackEvent: vi.fn(),
}))

vi.mock('./themePreviewLoader', () => ({
  THEME_PREVIEW_LAYOUT_LIMIT: 2,
  loadThemePreviewLayouts: vi.fn().mockResolvedValue([]),
}))

function buildGeneratedPalette(primary = '#5a43d5', background = '#f5f2ff') {
  return {
    primary,
    background,
    card: '#ece8ff',
    stroke: '#cbc3ff',
    primary_text: '#ffffff',
    background_text: '#1f1148',
    graph_0: '#5a43d5',
    graph_1: '#6f5be0',
    graph_2: '#826ee8',
    graph_3: '#9582ed',
    graph_4: '#a798f1',
    graph_5: '#b8adf5',
    graph_6: '#c8c1f8',
    graph_7: '#d9d6fb',
    graph_8: '#ebeafe',
    graph_9: '#f5f2ff',
  }
}

function buildWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider>{children}</I18nProvider>
  }
}

describe('useThemePanelController', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    const localStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
      clear: () => {
        storage.clear()
      },
    }

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.setItem('appLanguage', 'en')
    navigationState.searchParams = new URLSearchParams()
    themeApi.getThemes.mockResolvedValue([])
    themeApi.getUserFonts.mockResolvedValue({ fonts: [] })
    themeApi.generateTheme.mockResolvedValue(buildGeneratedPalette())
    themeApi.createTheme.mockResolvedValue({
      ...FALLBACK_THEME,
      id: 'created-theme',
      user: 'local-user',
      name: 'Saved Theme',
      logo: '',
      logo_url: '',
      company_name: '',
    })
  })

  it('prefills a new theme, marks dirty seed changes, and only regenerates on the explicit action', async () => {
    navigationState.searchParams = new URLSearchParams('tab=new-theme')
    const { result } = renderHook(() => useThemePanelController(), {
      wrapper: buildWrapper(),
    })

    await waitFor(() => expect(themeApi.generateTheme).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.editorState.isSheetOpen).toBe(true))

    expect(result.current.editorState.currentStep).toBe('colors')
    expect(result.current.editorState.paletteDirty).toBe(false)
    expect(result.current.editorState.hasGeneratedPalette).toBe(true)

    act(() => {
      result.current.actions.handleColorChange('primary', '#111111')
    })

    expect(result.current.editorState.paletteDirty).toBe(true)

    act(() => {
      result.current.actions.handlePrimaryStepAction()
    })

    expect(result.current.editorState.currentStep).toBe('fonts')
    expect(themeApi.generateTheme).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.actions.handleGeneratePalette()
    })

    expect(themeApi.generateTheme).toHaveBeenCalledTimes(2)
    expect(themeApi.generateTheme.mock.calls[1][0]).toMatchObject({
      primary: '#111111',
    })
    expect(result.current.editorState.paletteDirty).toBe(false)
  })

  it('keeps footer navigation generation-free for existing themes and saves without optional brand assets', async () => {
    const { result } = renderHook(() => useThemePanelController(), {
      wrapper: buildWrapper(),
    })

    await waitFor(() => expect(themeApi.getThemes).toHaveBeenCalled())

    const selectedTheme = {
      ...FALLBACK_THEME,
      id: 'light-rose',
      name: 'Light Rose',
      user: 'system',
      logo: '',
      logo_url: '',
      company_name: '',
    }

    act(() => {
      result.current.actions.handleThemeSelect(selectedTheme)
    })

    expect(result.current.editorState.paletteDirty).toBe(false)

    act(() => {
      result.current.actions.handleColorChange('primary', '#222222')
    })

    expect(result.current.editorState.paletteDirty).toBe(true)

    act(() => {
      result.current.actions.handlePrimaryStepAction()
    })

    expect(result.current.editorState.currentStep).toBe('fonts')
    expect(themeApi.generateTheme).not.toHaveBeenCalled()

    act(() => {
      result.current.actions.handlePrimaryStepAction()
    })

    expect(result.current.editorState.currentStep).toBe('brand')

    act(() => {
      result.current.actions.handlePrimaryStepAction()
    })

    await waitFor(() => expect(themeApi.createTheme).toHaveBeenCalledTimes(1))
    expect(themeApi.generateTheme).not.toHaveBeenCalled()
    expect(themeApi.createTheme.mock.calls[0][0]).toMatchObject({
      company_name: null,
      logo: null,
      logo_url: null,
    })
  })
})

