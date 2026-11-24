import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Бэкенд локально: cd backend && dotnet run (порт 8080)
    proxy: { '/api': 'http://localhost:8080' },
  },
})
