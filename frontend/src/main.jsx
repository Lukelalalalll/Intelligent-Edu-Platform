import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { log } from './utils/logger'

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
