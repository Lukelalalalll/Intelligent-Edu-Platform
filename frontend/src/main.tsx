import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/base.css'
import './styles/utilities.css'
import App from './App'
import { log } from './shared/utils/logger'

// Apply theme before first paint to prevent flash of wrong theme
const storedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = storedTheme || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', theme);

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
    <App />
  </StrictMode>,
)
