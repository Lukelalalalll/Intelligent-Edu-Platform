import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/shared/i18n'
import { FALLBACK_THEME, THEME_EDITOR_STEPS } from './constants'
import { ThemeEditorSheet } from './ThemeEditorSheet'

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="sheet-root">{children}</div> : null,
  SheetContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

const previewLayouts = [
  {
    layoutId: 'sample-1',
    component: ({ data }: { data: { title: string } }) => <div>{data.title}</div>,
    sampleData: { title: 'Sample one' },
  },
  {
    layoutId: 'sample-2',
    component: ({ data }: { data: { title: string } }) => <div>{data.title}</div>,
    sampleData: { title: 'Sample two' },
  },
]

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

function buildProps(
  overrides: Partial<React.ComponentProps<typeof ThemeEditorSheet>> = {}
): React.ComponentProps<typeof ThemeEditorSheet> {
  return {
    open: true,
    onOpenChange: vi.fn(),
    selectedTheme: {
      ...FALLBACK_THEME,
      id: 'light-rose',
      name: 'Light Rose',
    },
    isNewTheme: false,
    currentStep: 'colors',
    currentStepIndex: 0,
    totalSteps: THEME_EDITOR_STEPS.length,
    currentStepMeta: THEME_EDITOR_STEPS[0],
    customColors: FALLBACK_THEME.data.colors,
    customFonts: FALLBACK_THEME.data.fonts,
    customBrandLogo: null,
    isLogoUploading: false,
    isFontUploading: false,
    isPaletteGenerating: false,
    paletteDirty: false,
    hasGeneratedPalette: true,
    showColorPicker: null,
    themeCompanyName: '',
    userFonts: { fonts: [] },
    totalThemeCount: 5,
    slideContainerRef: React.createRef<HTMLDivElement>(),
    previewThemeStyle: { '--primary-color': FALLBACK_THEME.data.colors.primary } as React.CSSProperties,
    previewScale: 0.5,
    previewSlideWidth: 640,
    previewSlideHeight: 360,
    previewLayouts,
    isPreviewLayoutsLoading: false,
    onClickOutside: vi.fn(),
    onShowColorPicker: vi.fn(),
    onColorChange: vi.fn(),
    onGeneratePalette: vi.fn().mockResolvedValue(undefined),
    onFontSelect: vi.fn(),
    onFontUpload: vi.fn().mockResolvedValue(undefined),
    onBrandLogoUpload: vi.fn().mockResolvedValue(undefined),
    onThemeNameBlur: vi.fn(),
    onThemeCompanyNameBlur: vi.fn(),
    onRemoveLogo: vi.fn(),
    onPreviousStep: vi.fn(),
    onPrimaryAction: vi.fn(),
    ...overrides,
  }
}

describe('ThemeEditorSheet', () => {
  beforeAll(() => {
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

    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      HTMLElement.prototype.setPointerCapture = () => {}
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      HTMLElement.prototype.releasePointerCapture = () => {}
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = () => {}
    }
  })

  beforeEach(() => {
    window.localStorage.setItem('appLanguage', 'en')
  })

  it('shows a 3-step workflow with separate palette generation and navigation', async () => {
    const user = userEvent.setup()
    const onGeneratePalette = vi.fn().mockResolvedValue(undefined)
    const onPrimaryAction = vi.fn()

    renderWithI18n(
      <ThemeEditorSheet
        {...buildProps({
          onGeneratePalette,
          onPrimaryAction,
        })}
      />
    )

    expect(screen.getByText('Sample preview')).toBeInTheDocument()
    expect(screen.getByText('2 representative sample slides')).toBeInTheDocument()
    expect(screen.getAllByText('Step 1 of 3')).toHaveLength(2)
    expect(screen.getAllByText('Colors').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fonts').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Brand').length).toBeGreaterThan(0)
    expect(screen.queryByText('Palette')).not.toBeInTheDocument()
    expect(screen.queryByText('Logo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Regenerate palette' }))
    expect(onGeneratePalette).toHaveBeenCalledTimes(1)
    expect(onPrimaryAction).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Continue to Fonts' }))
    expect(onPrimaryAction).toHaveBeenCalledTimes(1)
  })

  it('shows the final brand summary and optional status on the last step', () => {
    renderWithI18n(
      <ThemeEditorSheet
        {...buildProps({
          currentStep: 'brand',
          currentStepIndex: 2,
          currentStepMeta: THEME_EDITOR_STEPS[2],
        })}
      />
    )

    expect(screen.getAllByText('Step 3 of 3')).toHaveLength(2)
    expect(screen.getByText('Optional')).toBeInTheDocument()
    expect(screen.getByText('What gets saved')).toBeInTheDocument()
    expect(screen.getByText('Theme name')).toBeInTheDocument()
    expect(screen.getByText('Light Rose')).toBeInTheDocument()
    expect(screen.getByText('Optional / not added')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Custom Theme' })).toBeInTheDocument()
  })
})
