import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  worker: { format: 'es' },
  server: {
    // 本机开发：/api 转发到本机后端（uv run fastapi dev），和生产一样同源
    proxy: { '/api': 'http://localhost:8000' },
  },
})
