import { Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import CardNav from '../reactbits/CardNav'
import { useStudyTimer } from '../../hooks/useStudyTimer'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/**
 * 主布局壳 —— 响应式双模式
 *
 * 桌面端 (>=768px)：左侧 CardNav 侧边导航 + 右侧宽内容区
 * 移动端 (<768px)：底部 Tab 导航 + 全宽沉浸式容器
 */
export default function AppShell() {
  useStudyTimer()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const location = useLocation()
  const isWideWorkspace = location.pathname === '/app/vocab'

  if (isDesktop) {
    return (
      <div className="h-full flex bg-[var(--color-background-secondary)]">
        {/* 桌面侧边导航 */}
        <CardNav />

        {/* 桌面内容区 —— 宽屏自适应 */}
        <main className="flex-1 h-full overflow-y-auto">
          <div className={`mx-auto w-full px-6 py-4 ${isWideWorkspace ? 'max-w-[1680px] 2xl:px-8' : 'max-w-[1200px]'}`}>
            <Outlet />
          </div>
        </main>
      </div>
    )
  }

  // 移动端：改为真正全宽，避免在大屏手机上露出两侧底色
  return (
    <div className="flex min-h-[100dvh] w-full justify-center bg-[var(--color-background)]">
      <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[var(--color-background)]">
        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
