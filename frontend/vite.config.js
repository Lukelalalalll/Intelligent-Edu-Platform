import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const internalGatewayToken = String(env.INTERNAL_GATEWAY_TOKEN || '').trim()
  const backendTarget = String(env.VITE_DEV_BACKEND_TARGET || 'http://127.0.0.1:5009').trim()
  const proxyHeaders = internalGatewayToken
    ? { 'X-Internal-Gateway': internalGatewayToken }
    : {}

  if (command === 'serve' && !internalGatewayToken) {
    console.warn(
      '[vite] INTERNAL_GATEWAY_TOKEN is not set. Local /api proxy requests will fail until it matches backend/.env.'
    )
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'next/navigation': path.resolve(__dirname, 'src/presenton/shims/next-navigation.ts'),
        'next/link': path.resolve(__dirname, 'src/presenton/shims/next-link.tsx'),
        'next/image': path.resolve(__dirname, 'src/presenton/shims/next-image.tsx'),
        'next/headers': path.resolve(__dirname, 'src/presenton/shims/next-headers.ts'),
        'next': path.resolve(__dirname, 'src/presenton/shims/next.ts'),
      },
    },
    build: {
      modulePreload: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (
              id.includes('/react/') ||
              id.includes('\\react\\') ||
              id.includes('react-dom') ||
              id.includes('react-router-dom') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor'
            }

            if (
              id.includes('pdfjs-dist') ||
              id.includes('react-pdf') ||
              id.includes('react-pdf-highlighter')
            ) {
              return 'pdf-vendor'
            }

            if (
              id.includes('highlight.js') ||
              id.includes('marked') ||
              id.includes('dompurify')
            ) {
              return 'markdown-vendor'
            }

            if (id.includes('framer-motion')) {
              return 'motion-vendor'
            }

            if (
              id.includes('@tanstack/react-virtual') ||
              id.includes('zustand')
            ) {
              return 'state-vendor'
            }

            return undefined
          },
        },
      },
    },
    server: {
      proxy: {
        // Proxy all /api and /static requests to the FastAPI backend in dev.
        // This makes them same-origin → no CORS issues, no credentials dance.
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          headers: proxyHeaders,
        },
        '/static': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          headers: proxyHeaders,
        },
        '/app_data': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          headers: proxyHeaders,
        },
      },
    },
  }
})
