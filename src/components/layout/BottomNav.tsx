import { NavLink } from 'react-router-dom'
import { Languages, BookOpen, Library, User } from 'lucide-react'

/* 底部 Tab 导航栏配置 */
const tabs = [
  { path: '/translate', label: '翻译', icon: Languages },
  { path: '/learn', label: '学习', icon: BookOpen },
  { path: '/vocab', label: '词库', icon: Library },
  { path: '/profile', label: '个人', icon: User },
]

export default function BottomNav() {
  return (
    <nav
      className="flex items-center justify-around bg-[var(--color-card)] border-t border-[var(--color-border)]"
      style={{ boxShadow: 'var(--shadow-nav)' }}
    >
      {tabs.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            /* 每个 Tab 占据等分宽度，垂直居中 */
            `flex flex-col items-center justify-center flex-1 py-2 pt-2.5 gap-0.5 transition-colors ${
              isActive
                ? 'text-[var(--color-primary)]'   /* 选中态：橙色 */
                : 'text-[var(--color-muted)]'      /* 未选中：灰色 */
            }`
          }
        >
          <Icon size={22} strokeWidth={1.8} />
          <span className="text-[11px] font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
