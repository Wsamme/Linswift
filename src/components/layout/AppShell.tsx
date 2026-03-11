import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import CardNav from '../reactbits/CardNav'
import { useStudyTimer } from '../../hooks/useStudyTimer'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/**
 * 主布局壳 —— 响应式双模式
 *
 * 桌面端 (>=768px)：左侧 CardNav 侧边导航 + 右侧宽内容区
 * 移动端 (<768px)：底部 Tab 导航 + 390px 窄屏容器
 */
export default function AppShell() {
  useStudyTimer()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  if (isDesktop) {
    return (
      <div className="h-full flex bg-[var(--color-background-secondary)]">
        {/* 桌面侧边导航 */}
        <CardNav />

        {/* 桌面内容区 —— 宽屏自适应 */}
        <main className="flex-1 h-full overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-6 py-4">
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  // 移动端：保持原有 390px 容器
  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] h-full flex flex-col bg-[var(--color-background)] relative overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
