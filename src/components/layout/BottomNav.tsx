import { NavLink } from 'react-router-dom'
import { Languages, BookOpen, Library, User } from 'lucide-react'
import { t, useAppLanguage } from '../../lib/i18n'
import { handleSafeRouteClick } from '../../lib/navigation'

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
      className="glass-bottom-bar flex items-center justify-around rounded-[26px] border border-[var(--glass-border)] px-2 py-2"
      style={{ boxShadow: '0 18px 38px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.58)' }}
    >
      {tabs.map(({ path, key, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          onClick={(event) => {
            handleSafeRouteClick(event, path)
          }}
          className={({ isActive }) =>
            /* 每个 Tab 占据等分宽度，垂直居中 */
            `flex flex-col items-center justify-center flex-1 rounded-[18px] py-2 gap-0.5 transition-colors ${
              isActive
                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'text-[var(--color-muted)]'
            }`
          }
        >
          <Icon size={21} strokeWidth={1.9} />
          <span className="text-[11px] font-medium">{t(lang, key)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
