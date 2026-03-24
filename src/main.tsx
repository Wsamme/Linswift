import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/latin-400.css'
import { AuthProvider } from './contexts/AuthContext'
import './globals.css'
import App from './App'
import { applyThemeSettings, loadThemeSettings } from './lib/theme'

/**
 * 全局 React Query 客户端
 * 配置默认策略：
 *   - staleTime: 数据被认为"新鲜"的时间（毫秒）
 *   - gcTime: 垃圾回收时间（缓存保留时间）
 *   - retry: 失败重试次数
 *   - refetchOnWindowFocus: 窗口获焦时是否重新请求
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 默认 5 分钟内认为数据是新鲜的
      gcTime: 10 * 60 * 1000,          // 缓存保留 10 分钟
      retry: 1,                         // 失败重试 1 次
      refetchOnWindowFocus: false,      // 切回窗口时不自动刷新（省流量）
    },
  },
})

// 启动时先应用本地主题，避免首屏闪动
applyThemeSettings(loadThemeSettings())

const isDesktopShell =
  window.location.protocol === 'file:' || window.navigator.userAgent.includes('Electron')

const Router = isDesktopShell ? HashRouter : BrowserRouter
const LEGACY_WEB_CACHE_RESET_KEY = 'linswift.web-cache-reset.v2'

async function cleanupLegacyWebCaches() {
  if (isDesktopShell || typeof window === 'undefined') return false

  let shouldReload = false

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (registrations.length > 0 || navigator.serviceWorker.controller) {
        shouldReload = true
      }
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }

    if ('caches' in window) {
      const cacheKeys = await caches.keys()
      if (cacheKeys.length > 0) {
        shouldReload = true
      }
      await Promise.all(cacheKeys.map((key) => caches.delete(key)))
    }
  } catch (error) {
    console.warn('清理旧版 PWA 缓存失败，继续普通网页模式运行', error)
  }

  return shouldReload
}

async function bootstrap() {
  const shouldReload = await cleanupLegacyWebCaches()

  if (!isDesktopShell && shouldReload) {
    const alreadyReloaded = window.sessionStorage.getItem(LEGACY_WEB_CACHE_RESET_KEY) === '1'
    if (!alreadyReloaded) {
      window.sessionStorage.setItem(LEGACY_WEB_CACHE_RESET_KEY, '1')
      window.location.reload()
      return
    }
  }

  if (!isDesktopShell) {
    window.sessionStorage.removeItem(LEGACY_WEB_CACHE_RESET_KEY)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router>
        {/* QueryClientProvider 为整个应用提供 React Query 缓存能力 */}
        <QueryClientProvider client={queryClient}>
          {/* AuthProvider 包裹整个应用，让所有组件都能访问认证状态 */}
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </Router>
    </StrictMode>,
  )
}

void bootstrap()
