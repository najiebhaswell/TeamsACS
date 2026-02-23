import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/reactui/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../assets/static/reactui',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/admin': 'http://localhost:2979',
      '/login': 'http://localhost:2979',
      '/token': 'http://localhost:2979',
      '/logout': 'http://localhost:2979',
    },
  },
})
