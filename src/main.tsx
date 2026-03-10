import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import './globals.css'
import App from './App'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* QueryClientProvider 为整个应用提供 React Query 缓存能力 */}
      <QueryClientProvider client={queryClient}>
        {/* AuthProvider 包裹整个应用，让所有组件都能访问认证状态 */}
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
