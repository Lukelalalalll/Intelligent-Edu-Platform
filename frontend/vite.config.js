import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      // Proxy all /api and /static requests to the FastAPI backend in dev.
      // This makes them same-origin → no CORS issues, no credentials dance.
      '/api': {
        target: 'http://localhost:5009',
        changeOrigin: true,
        secure: false,
      },
      '/static': {
        target: 'http://localhost:5009',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
