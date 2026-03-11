/**
 * ProtectedRoute - 受保护的路由组件
 *
 * 功能：
 * 1. 未登录 -> 自动跳转到 /login 页面
 * 2. 加载中 -> 显示加载动画（骨架屏）
 * 3. 已登录 -> 正常渲染子组件
 *
 * 使用方式：
 *   <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  // 1. 正在检查认证状态（首次加载时）
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
        {/* 加载动画 */}
        <div className="w-[56px] h-[56px] rounded-full bg-[var(--color-primary)] flex items-center justify-center mb-4 animate-pulse">
          <span className="text-white text-[24px] font-extrabold">L</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--color-muted)]">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-[14px]">加载中...</span>
        </div>
      </div>
    )
  }

  // 2. 未登录 -> 重定向到落地页（而非直接登录页，让用户了解产品后再登录）
  if (!user) {
    return <Navigate to="/" replace />
  }

  // 3. 已登录 -> 正常渲染
  return <>{children}</>
}
