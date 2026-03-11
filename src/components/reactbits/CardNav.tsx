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
  Headphones, Mic, BookOpenText, ChevronRight,
  Sparkles,
} from 'lucide-react'

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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const subRefs = useRef<(HTMLDivElement | null)[]>([])

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
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8400] to-[#FF9E33] flex items-center justify-center">
          <Sparkles size={18} className="text-white" />
        </div>
        <span className="text-[20px] font-bold text-[var(--color-foreground)] tracking-tight">
          Linswift
        </span>
      </div>

      {/* 导航卡片 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-2">
        {navItems.map((item, idx) => {
          const Icon = item.icon
          const isExpanded = expandedIdx === idx
          const hasSubLinks = item.subLinks.length > 0

          return (
            <div key={item.path} ref={(el) => { cardRefs.current[idx] = el }}>
              {/* 主导航项 */}
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
                <span className="text-[15px] font-semibold flex-1">{item.label}</span>
                {hasSubLinks && (
                  <ChevronRight
                    size={16}
                    className={`transition-transform duration-200 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                )}
              </NavLink>

              {/* 子链接面板（GSAP 动画展开） */}
              {hasSubLinks && (
                <div
                  ref={(el) => { subRefs.current[idx] = el }}
                  className="overflow-hidden"
                  style={{ height: 0, opacity: 0 }}
                >
                  <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l-2 pl-3"
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
                          {sub.label}
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

      {/* 底部版本号 */}
      <div className="px-5 py-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted)]">
        Linswift v2.1.0
      </div>
    </aside>
  )
}
