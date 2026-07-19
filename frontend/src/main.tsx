import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import './index.css'
import './ppt_generator/ppt_generator-globals.css'
import './styles/base.css'
import './styles/utilities.css'
import App from './App'
import { applyLocale, detectInitialLocale, I18nProvider } from '@/shared/i18n'
import { log } from './shared/utils/logger'
import AppToaster from '@/components/ui/AppToaster'
import { store } from '@/store/store'

/** Minimal process shim required by browser-side code ported from Node-oriented tooling. */
type BrowserProcessShim = {
  env: Record<string, string | undefined>
}

const globalWithProcess = globalThis as typeof globalThis & {
  process?: BrowserProcessShim
}

// Provide process.env before importing runtime paths that expect Node-like globals.
if (!globalWithProcess.process) {
  globalWithProcess.process = { env: {} }
} else if (!globalWithProcess.process.env) {
  globalWithProcess.process.env = {}
}

// Apply persisted theme before first paint to prevent a flash of the wrong theme.
const storedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = storedTheme || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);
applyLocale(detectInitialLocale());

log.info('frontend', 'Application bootstrapping')

window.addEventListener('error', (event) => {
  log.error('frontend', 'Unhandled runtime error', {
    message: event?.message,
    source: event?.filename,
    line: event?.lineno,
    column: event?.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  log.error('frontend', 'Unhandled promise rejection', {
    reason: String(event?.reason || ''),
  })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <I18nProvider>
        <App />
        <AppToaster />
      </I18nProvider>
    </Provider>
  </StrictMode>,
)

