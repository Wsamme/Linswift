import { Outlet } from 'react-router-dom'
import CardNav from '../reactbits/CardNav'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/**
 * 阅读器布局壳
 *
 * 桌面端：左侧 CardNav + 右侧阅读区（不限制 max-width，给 PDF 更多空间）
 * 移动端：全屏阅读，无底部导航（阅读器自带返回按钮）
 */
export default function ReaderShell() {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  if (isDesktop) {
    return (
      <div className="glass-page h-full overflow-x-auto bg-[var(--color-background)]">
        <div className="flex h-full min-w-[1220px] bg-[var(--color-background)]">
          <CardNav />
          <main className="h-full min-w-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
            <Outlet />
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-[var(--color-background)]">
      <Outlet />
    </div>
  )
}
