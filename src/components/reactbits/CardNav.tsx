/**
 * CardNav — 桌面端卡片式侧边导航
 * 灵感来自 https://reactbits.dev/components/card-nav
 * 用 GSAP 动画 + 彩色卡片展开效果
 * 适配 React Router 的 SPA 导航模式
 */
import React, { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import {
  Languages, BookOpen, Library, User,
  Headphones, Mic, BookOpenText, ChevronRight, Settings,
  Sparkles, BrainCircuit, Tags,
} from 'lucide-react'
import { t, useAppLanguage } from '../../lib/i18n'
import BrandLogo from '../common/BrandLogo'
import { useAuth } from '../../contexts/AuthContext'
import { useProfile } from '../../hooks/useProfile'

/* ===== 类型定义 ===== */
interface NavSubLink {
  label: string
  path: string
  icon: React.ElementType
}

interface NavCardItem {
  label: string
  path: string
  icon: React.ElementType
  bgColor: string
  textColor: string
  subLinks: NavSubLink[]
}

/* ===== 导航配置 ===== */
const navItems: NavCardItem[] = [
  {
    label: '翻译',
    path: '/app/translate',
    icon: Languages,
    bgColor: '#FF8400',
    textColor: '#fff',
    subLinks: [],
  },
  {
    label: '学习',
    path: '/app/learn',
    icon: BookOpen,
    bgColor: '#8B5CF6',
    textColor: '#fff',
    subLinks: [
      { label: '背单词', path: '/ebbinghaus', icon: BookOpen },
      { label: '听力训练', path: '/listening', icon: Headphones },
      { label: '口语练习', path: '/speaking', icon: Mic },
      { label: '语法知识树', path: '/grammar', icon: BookOpenText },
    ],
  },
  {
    label: '词库',
    path: '/app/vocab',
    icon: Library,
    bgColor: '#3B82F6',
    textColor: '#fff',
    subLinks: [
      { label: '闪卡复习', path: '/ebbinghaus', icon: Sparkles },
      { label: '拼写游戏', path: '/spelling-game', icon: BookOpenText },
      { label: '词汇量测试', path: '/vocab-test', icon: BrainCircuit },
      { label: 'AI分类', path: '/ai-classify', icon: Tags },
    ],
  },
  {
    label: '个人',
    path: '/app/profile',
    icon: User,
    bgColor: '#22C55E',
    textColor: '#fff',
    subLinks: [],
  },
]

/* ===== 组件 ===== */
export default function CardNav() {
  const navigate = useNavigate()
  const lang = useAppLanguage()
  const { user } = useAuth()
  const { profile } = useProfile()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const subRefs = useRef<(HTMLDivElement | null)[]>([])
  const displayName = profile?.username || user?.user_metadata?.username || user?.email?.split('@')[0] || t(lang, 'profile_user_fallback')
  const displayAccount = user?.email || 'guest@linswift.app'
  const avatarLetter = displayName.charAt(0).toUpperCase()

  // GSAP 展开 / 收起子菜单
  useLayoutEffect(() => {
    subRefs.current.forEach((el, i) => {
      if (!el) return
      if (i === expandedIdx) {
        gsap.to(el, {
          height: 'auto',
          opacity: 1,
          duration: 0.35,
          ease: 'power3.out',
        })
      } else {
        gsap.to(el, {
          height: 0,
          opacity: 0,
          duration: 0.25,
          ease: 'power3.in',
        })
      }
    })
  }, [expandedIdx])

  const handleCardClick = (item: NavCardItem, idx: number) => {
    if (item.subLinks.length > 0) {
      setExpandedIdx(expandedIdx === idx ? null : idx)
    }
    navigate(item.path)
  }

  return (
    <aside className="w-[260px] h-full flex flex-col bg-[var(--color-background)] border-r border-[var(--color-border)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 py-5">
          <BrandLogo
            className="gap-4"
            iconFrameClassName="flex h-18 w-18 items-center justify-center rounded-[24px] bg-white px-2.5 py-2.5 shadow-[0_18px_34px_rgba(255,132,0,0.16),0_4px_10px_rgba(36,26,14,0.08),inset_0_2px_0_rgba(255,255,255,0.92),inset_0_-4px_12px_rgba(255,162,54,0.12)] ring-1 ring-[#fff4ea]"
            imageClassName="h-13 w-13 object-contain drop-shadow-[0_4px_6px_rgba(183,97,17,0.12)]"
            textClassName="text-[21px] font-extrabold text-[var(--color-foreground)] tracking-[-0.03em]"
          />
        </div>

        <nav className="flex flex-col gap-2 px-3 pb-4">
          {navItems.map((item, idx) => {
            const Icon = item.icon
            const isExpanded = expandedIdx === idx
            const hasSubLinks = item.subLinks.length > 0

            return (
              <div key={item.path} ref={(el) => { cardRefs.current[idx] = el }}>
                <NavLink
                  to={item.path}
                  onClick={(e) => {
                    if (hasSubLinks) {
                      e.preventDefault()
                      handleCardClick(item, idx)
                    }
                  }}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer select-none ${
                      isActive
                        ? 'text-white shadow-lg'
                        : 'text-[var(--color-foreground)] hover:bg-[var(--color-background-secondary)]'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive ? { backgroundColor: item.bgColor } : {}
                  }
                >
                  <Icon size={20} strokeWidth={1.8} />
                  <span className="text-[15px] font-semibold flex-1">
                    {item.path === '/app/translate' ? t(lang, 'nav_translate')
                      : item.path === '/app/learn' ? t(lang, 'nav_learn')
                      : item.path === '/app/vocab' ? t(lang, 'nav_vocab')
                      : t(lang, 'nav_profile')}
                  </span>
                  {hasSubLinks && (
                    <ChevronRight
                      size={16}
                      className={`transition-transform duration-200 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  )}
                </NavLink>

                {hasSubLinks && (
                  <div
                    ref={(el) => { subRefs.current[idx] = el }}
                    className="overflow-hidden"
                    style={{ height: 0, opacity: 0 }}
                  >
                    <div
                      className="ml-4 mt-1 flex flex-col gap-0.5 border-l-2 pl-3"
                      style={{ borderColor: item.bgColor + '40' }}
                    >
                      {item.subLinks.map((sub) => {
                        const SubIcon = sub.icon
                        return (
                          <NavLink
                            key={sub.path}
                            to={sub.path}
                            className={({ isActive }) =>
                              `flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 ${
                                isActive
                                  ? 'font-semibold'
                                  : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-background-secondary)]'
                              }`
                            }
                            style={({ isActive }) =>
                              isActive ? { color: item.bgColor } : {}
                            }
                          >
                            <SubIcon size={14} />
                            {sub.path === '/ebbinghaus'
                              ? t(lang, item.path === '/app/vocab' ? 'nav_vocab_flashcard' : 'nav_learn_word')
                              : sub.path === '/spelling-game'
                                ? t(lang, 'nav_vocab_spelling')
                                : sub.path === '/vocab-test'
                                  ? t(lang, 'nav_vocab_test')
                                  : sub.path === '/ai-classify'
                                    ? t(lang, 'nav_vocab_ai_classify')
                                : sub.path === '/listening'
                                  ? t(lang, 'nav_learn_listen')
                                  : sub.path === '/speaking'
                                    ? t(lang, 'nav_learn_speak')
                                    : t(lang, 'nav_learn_grammar')}
                          </NavLink>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-[var(--color-border)] px-3 py-3">
        <NavLink
          to="/learning-settings"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors ${
              isActive
                ? 'bg-[var(--color-background-secondary)] text-[var(--color-primary)]'
                : 'text-[var(--color-foreground)] hover:bg-[var(--color-background-secondary)]'
            }`
          }
        >
          <Settings size={18} strokeWidth={1.8} />
          <span className="flex-1">{t(lang, 'profile_settings')}</span>
        </NavLink>

        <button
          type="button"
          onClick={() => navigate('/profile-edit')}
          className="mt-3 w-full rounded-[20px] border border-[var(--color-border)] bg-[var(--color-background-secondary)]/70 px-4 py-3 text-left transition-colors hover:bg-[var(--color-background-secondary)]"
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
            Account
          </div>
          <div className="flex items-center gap-3">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={t(lang, 'profile_avatar_alt')}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-[16px] font-bold text-white">
                {avatarLetter}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-[var(--color-foreground)]">
                {displayName}
              </div>
              <div className="mt-1 truncate text-[12px] text-[var(--color-muted)]">
                {displayAccount}
              </div>
            </div>
          </div>
        </button>

        <div className="px-2 pt-3 text-[11px] text-[var(--color-muted)]">
          Linswift v2.1.0
        </div>
      </div>
    </aside>
  )
}
