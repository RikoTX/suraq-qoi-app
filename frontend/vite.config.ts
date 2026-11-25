import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Слабый интернет (ТЗ, 8): оболочка приложения в кеше Service Worker — открывается без сети.
    // Данные ученика — в IndexedDB (src/offline), запросы /api не кешируются.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Сұрақ қой — Обыграй ИИ',
        short_name: 'Сұрақ қой',
        description: 'Тренажёр чтения: задай вопрос к тексту глубже, чем ИИ',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#6a5ae0',
        theme_color: '#6a5ae0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Шрифт Rubik: один раз скачали — дальше из кеша, даже без сети.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Бэкенд локально: cd backend && dotnet run (порт 8080)
    proxy: { '/api': 'http://localhost:8080' },
  },
  // npm run preview — проверка собранного PWA (Service Worker работает только в сборке).
  preview: {
    proxy: { '/api': 'http://localhost:8080' },
  },
})
