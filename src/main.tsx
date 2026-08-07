import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { initTheme } from './lib/settings'
import './index.css'

// 在 React 渲染前应用主题，避免闪烁
initTheme()

// 移动端检测（在组件外同步判断，用于 QueryClient 配置）
const isMobile =
  typeof window !== 'undefined' &&
  (window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|HarmonyOS|Mobile/i.test(
      navigator.userAgent,
    ))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 分钟内不重新请求
      gcTime: 1000 * 60 * 10, // 缓存保留 10 分钟
      refetchOnWindowFocus: !isMobile, // 移动端切 App 回来不自动刷新
      refetchOnReconnect: true,
      retry: 1, // 失败只重试 1 次，减少安卓弱网等待
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position={isMobile ? 'bottom-center' : 'top-right'}
          richColors
          closeButton
          // 安卓端关闭动画 + 缩短停留，减少 GPU/主线程消耗
          pauseWhenPageIsHidden
          duration={isMobile ? 2200 : 4000}
          style={isMobile ? { animationDuration: '0ms' } : undefined}
          toastOptions={
            isMobile
              ? {
                  classNames: {
                    toast: 'animate-none !duration-0',
                    title: 'text-sm',
                    description: 'text-xs',
                    content: 'py-2',
                  },
                }
              : undefined
          }
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
