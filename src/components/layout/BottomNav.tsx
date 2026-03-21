import { NavLink } from 'react-router-dom'
import { Languages, BookOpen, Library, User } from 'lucide-react'
import { t, useAppLanguage } from '../../lib/i18n'

/* 底部 Tab 导航栏配置 */
const tabs = [
  { path: '/app/translate', key: 'nav_translate' as const, icon: Languages },
  { path: '/app/learn', key: 'nav_learn' as const, icon: BookOpen },
  { path: '/app/vocab', key: 'nav_vocab' as const, icon: Library },
  { path: '/app/profile', key: 'nav_profile' as const, icon: User },
]

export default function BottomNav() {
  const lang = useAppLanguage()
  return (
    <nav
      className="glass-bottom-bar flex items-center justify-around border-t border-[var(--color-border)] pb-[max(env(safe-area-inset-bottom),8px)]"
      style={{ boxShadow: 'var(--shadow-nav)' }}
    >
      {tabs.map(({ path, key, icon: Icon }) => (
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
          <span className="text-[11px] font-medium">{t(lang, key)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
