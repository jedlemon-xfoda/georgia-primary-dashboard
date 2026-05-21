import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts', 'd3', 'topojson-client'],
          'vendor-motion': ['framer-motion'],
          'vendor-data': ['papaparse', 'date-fns', 'zustand'],
          'vendor-xlsx': ['xlsx'],
        },
      },
    },
  },
})
