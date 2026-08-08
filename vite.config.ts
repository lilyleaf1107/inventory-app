import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// GitHub Pages 部署时设置 DEPLOY_TARGET=github-pages
const isGithubPages = process.env.DEPLOY_TARGET === 'github-pages'

export default defineConfig({
  base: isGithubPages ? '/inventory-app/' : '/',
  plugins: [
    react(),
    VitePWA({
      disable: isGithubPages,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '进出库管理系统',
        short_name: '进出库',
        description: '小团队进出库管理工具，支持扫码进出库',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // 排除 Supabase 请求和图片上传
        navigateFallbackDenylist: [/^https:\/\/.*\.supabase\.co\//],
        // 大文件（如 zxing 454KB）不预缓存，运行时按需加载即可
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: ['es2019', 'edge88', 'chrome78', 'safari13'],
    cssCodeSplit: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'react': ['react', 'react-dom', 'react-router-dom', 'scheduler'],
          'supabase': ['@supabase/supabase-js'],
          'react-query': ['@tanstack/react-query'],
          'zxing': ['@zxing/browser', '@zxing/library'],
          'lucide': ['lucide-react'],
          'sonner': ['sonner'],
          'radix': ['@radix-ui/react-select'],
          'utils': ['class-variance-authority', 'clsx', 'tailwind-merge', 'zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 1024,
  },
  server: {
    port: 5173,
    host: true,
  },
})
