import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-pdfjs': ['pdfjs-dist'],
          'vendor-xyflow': ['@xyflow/react'],
          'vendor-pdfviewer': [
            '@react-pdf-viewer/core',
            '@react-pdf-viewer/default-layout',
            '@react-pdf-viewer/thumbnail',
          ],
          'vendor-pdfrenderer': ['@react-pdf/renderer'],
          'vendor-markdown': ['react-markdown', 'remark-gfm', 'rehype-raw', 'rehype-sanitize'],
        },
      },
    },
  },
})
