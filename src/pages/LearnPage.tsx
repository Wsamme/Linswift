/**
 * 学习页（首页）—— 已接入 AI + Supabase
 * 支持桌面端宽屏布局 + SpotlightCard 动效
 *
 * 功能：
 * 1. AI 生成个性化欢迎问候和励志名言
 * 2. 学习热度图（从 study_records 读取，空数据时显示空白格）
 * 3. 连续学习天数（从 study_records 计算）
 * 4. 今日任务四宫格（跳转到各模块）
 * 5. 图书馆推荐（跳转到书架页）
 */

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import {
  Settings, Flame, BookOpenText, Headphones, Mic, BookOpen,
  Loader2, RefreshCw, Quote,
} from 'lucide-react'
import HeatMap from '../components/common/HeatMap'
import SpotlightCard from '../components/reactbits/SpotlightCard'
import BrandLogo from '../components/common/BrandLogo'
import { getDailyRecommendation, type DailyRecommendation } from '../services/gemini'
import { useAuth } from '../contexts/AuthContext'
import { useStudyRecords, type HeatmapCell } from '../hooks/useStudyRecords'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { supabase, type UserBook } from '../lib/supabase'
import { t, tf, useAppLanguage } from '../lib/i18n'
import { resolveUserBookMetadata } from '../lib/books'
import { getClassicBookBySlug } from '../data/classicBooks'
import ClassicBookCover from '../components/books/ClassicBookCover'
import { navigateSafely } from '../lib/navigation'

// 模块级缓存：页面切换后再回来不会重新请求
let cachedRecommendation: DailyRecommendation | null = null
let cachedHeatmapLevels: number[] = []
let cachedStreakDays = 0
let cachedBooks: UserBook[] = []
let cachedStudyUserId: string | null = null
let cachedBooksUserId: string | null = null
let cachedBookLimit = 0
let hasLoaded = false

export default function LearnPage() {
  const navigate = useNavigate()
  const lang = useAppLanguage()
  const { user } = useAuth()
  const { getHeatmapData, getStreakDays } = useStudyRecords()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [recommendation, setRecommendation] = useState<DailyRecommendation | null>(cachedRecommendation)
  const [isLoadingRec, setIsLoadingRec] = useState(!hasLoaded)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [heatmapLevels, setHeatmapLevels] = useState<number[]>(cachedHeatmapLevels)
  const [streakDays, setStreakDays] = useState(cachedStreakDays)
  const [books, setBooks] = useState<UserBook[]>(cachedBooks)
  const pageRef = useRef<HTMLDivElement>(null)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useLayoutEffect(() => {
    if (!pageRef.current) return

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      const bannerElements = gsap.utils.toArray<HTMLElement>('.learn-banner')
      const sectionTitleElements = gsap.utils.toArray<HTMLElement>('.learn-section-title')
      const taskCardElements = gsap.utils.toArray<HTMLElement>('.learn-task-card')
      const bookCardElements = gsap.utils.toArray<HTMLElement>('.learn-book-card')
      const sideCardElements = gsap.utils.toArray<HTMLElement>('.learn-side-card')
      const quoteElements = gsap.utils.toArray<HTMLElement>('.learn-banner-quote')

      mm.add('(prefers-reduced-motion: reduce)', () => {
        const resetTargets = [
          ...bannerElements,
          ...sectionTitleElements,
          ...taskCardElements,
          ...bookCardElements,
          ...sideCardElements,
          ...quoteElements,
        ]
        if (resetTargets.length > 0) {
          gsap.set(resetTargets, { clearProps: 'all' })
        }
      })

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })
        let quoteFloatTween: gsap.core.Tween | null = null

        if (bannerElements.length > 0) {
          intro.from(bannerElements, { y: 26, autoAlpha: 0, duration: 0.6 })
        }
        if (sectionTitleElements.length > 0) {
          intro.from(sectionTitleElements, { y: 18, autoAlpha: 0, stagger: 0.08, duration: 0.4 }, '-=0.3')
        }
        if (taskCardElements.length > 0) {
          intro.from(taskCardElements, { y: 24, autoAlpha: 0, stagger: 0.08, duration: 0.5 }, '-=0.2')
        }
        if (bookCardElements.length > 0) {
          intro.from(bookCardElements, { y: 20, autoAlpha: 0, stagger: 0.08, duration: 0.45 }, '-=0.25')
        }
        if (sideCardElements.length > 0) {
          intro.from(sideCardElements, { x: 20, autoAlpha: 0, stagger: 0.12, duration: 0.45 }, '-=0.5')
        }

        if (isDesktop && quoteElements.length > 0) {
          quoteFloatTween = gsap.to(quoteElements, {
            y: -6,
            duration: 2.8,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          })
        }

        return () => {
          quoteFloatTween?.kill()
          intro.kill()
        }
      })

      return () => mm.revert()
    }, pageRef)

    return () => ctx.revert()
  }, [isDesktop])

  useEffect(() => {
    if (!user?.id) {
      setHeatmapLevels([])
      setStreakDays(0)
      setBooks([])
      cachedHeatmapLevels = []
      cachedStreakDays = 0
      cachedBooks = []
      cachedStudyUserId = null
      cachedBooksUserId = null
      cachedBookLimit = 0
      hasLoaded = false
      return
    }

    const nextBookLimit = isDesktop ? 4 : 3
    const shouldLoadRecommendation = !hasLoaded || !cachedRecommendation
    const shouldLoadStudy = !hasLoaded || cachedStudyUserId !== user.id
    const shouldLoadBooks = !hasLoaded || cachedBooksUserId !== user.id || cachedBookLimit !== nextBookLimit

    if (shouldLoadRecommendation) {
      loadRecommendation()
    }
    if (shouldLoadStudy) {
      loadStudyData(user.id)
    }
    if (shouldLoadBooks) {
      loadBooks(user.id, nextBookLimit)
    }

    hasLoaded = true
  }, [user?.id, isDesktop]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadStudyData = async (userId: string) => {
    try {
      const cells: HeatmapCell[] = await getHeatmapData(36)
      if (!isMounted.current) return
      const levels = cells.map(c => c.level)
      setHeatmapLevels(levels)
      cachedHeatmapLevels = levels
      cachedStudyUserId = userId

      const streak = await getStreakDays()
      if (!isMounted.current) return
      setStreakDays(streak)
      cachedStreakDays = streak
    } catch {
      setHeatmapLevels([])
      setStreakDays(0)
      cachedHeatmapLevels = []
      cachedStreakDays = 0
    }
  }

  const loadBooks = async (userId: string, limit: number) => {
    const { data, error } = await supabase
      .from('user_books')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (!error && data) {
      const resolvedBooks = data.map(resolveUserBookMetadata)
      setBooks(resolvedBooks)
      cachedBooks = resolvedBooks
      cachedBooksUserId = userId
      cachedBookLimit = limit
    }
  }

  const loadRecommendation = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoadingRec(true)
    }
    try {
      const rec = await getDailyRecommendation()
      if (!isMounted.current) return
      setRecommendation(rec)
      cachedRecommendation = rec
    } catch {
      console.warn('AI 推荐加载失败')
    } finally {
      if (isMounted.current) {
        setIsLoadingRec(false)
        setIsRefreshing(false)
      }
    }
  }

  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0] || ''
  const openLibraryBook = (book: UserBook) => {
    if (book.file_path) {
      navigateSafely(navigate, `/pdf-reader?bookId=${book.id}`)
      return
    }

    navigateSafely(navigate, book.shared_book_slug ? `/reading?bookId=${book.id}` : `/reading-prep?bookId=${book.id}`)
  }

  return (
    <div ref={pageRef} className={isDesktop ? '' : 'px-5 pb-4'}>
      {/* ===== Header（仅移动端显示，桌面端已有侧边导航 logo）===== */}
      {!isDesktop && (
        <div className="flex items-center justify-between py-4">
          <BrandLogo
            imageClassName="h-9 w-9"
            textClassName="text-[22px] font-bold text-[var(--color-foreground)]"
          />
          <button
            onClick={() => navigateSafely(navigate, '/learning-settings')}
            className="w-10 h-10 rounded-full bg-[var(--color-background-secondary)] flex items-center justify-center active:scale-95 transition-transform"
            aria-label={t(lang, 'learn_settings')}
            title={t(lang, 'learn_settings')}
          >
            <Settings size={20} className="text-[var(--color-muted)]" />
          </button>
        </div>
      )}

      {/* ===== 桌面端双栏 / 移动端单栏 ===== */}
      <div className={isDesktop ? 'grid grid-cols-[1fr_340px] gap-6' : ''}>
        {/* 左主区域 */}
        <div className={`flex flex-col ${isDesktop ? 'gap-10' : 'gap-6'}`}>
          {/* AI 欢迎 Banner */}
          <div
            className="learn-banner rounded-2xl p-5 text-white relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #FF8400, #FF9E33)' }}
          >
            {isLoadingRec ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={24} className="animate-spin text-white/70" />
                <span className="ml-2 text-[13px] text-white/70">
                  {t(lang, 'learn_ai_preparing')}
                </span>
              </div>
            ) : recommendation ? (
              <>
                <p className="text-[13px] opacity-90 mb-1">
                  {recommendation.greeting}{displayName ? `, ${displayName}` : ''}
                </p>

                <div className="learn-banner-quote mt-2 p-3 bg-white/15 rounded-xl backdrop-blur-sm will-change-transform">
                  <div className="flex items-start gap-2">
                    <Quote size={14} className="text-white/70 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[13px] text-white/95 leading-relaxed italic">
                        {recommendation.motivationalQuote}
                      </p>
                      <p className="text-[11px] text-white/60 mt-1">
                        {recommendation.quoteTranslation}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[12px] opacity-80">💡 {recommendation.todayTip}</span>
                  <button
                    onClick={() => loadRecommendation(true)}
                    disabled={isRefreshing}
                    className="p-1.5 rounded-full bg-white/15 active:bg-white/25 transition-colors"
                  >
                    <RefreshCw size={14} className={`text-white/80 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] opacity-90 mb-1">
                  {t(lang, 'learn_greeting_fallback')}! 👋{displayName ? ` ${displayName}` : ''}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[12px] opacity-80">
                  <span>🔥 {tf(lang, 'learn_streak', { days: streakDays })}</span>
                </div>
              </>
            )}
          </div>

          {/* 今日任务 —— 桌面端 SpotlightCard */}
          <section className="flex flex-col gap-0.5 pb-3">
            <h3 className={`${isDesktop ? 'text-[18px]' : 'text-[16px]'} font-bold leading-none text-[var(--color-foreground)] font-secondary`}>
              <span className="learn-section-title inline-block">{t(lang, 'learn_today_tasks')}</span>
            </h3>
            <div className={`grid ${isDesktop ? 'grid-cols-4' : 'grid-cols-4 -mt-2'} gap-3`}>
              {isDesktop ? (
                <>
                  <DesktopTaskCard icon={BookOpen} label={t(lang, 'nav_learn_word')} desc={t(lang, 'learn_desc_spaced_repetition')} color="#FF8400" onClick={() => navigateSafely(navigate, '/ebbinghaus')} />
                  <DesktopTaskCard icon={Headphones} label={t(lang, 'nav_learn_listen')} desc="正在开发中" color="#8B5CF6" onClick={() => navigateSafely(navigate, '/listening')} />
                  <DesktopTaskCard icon={Mic} label={t(lang, 'nav_learn_speak')} desc="正在开发中" color="#3B82F6" onClick={() => navigateSafely(navigate, '/speaking')} />
                  <DesktopTaskCard icon={BookOpenText} label={t(lang, 'nav_learn_grammar')} desc="长难句功能已开放，其余正在开发中" color="#22C55E" onClick={() => navigateSafely(navigate, '/grammar')} />
                </>
              ) : (
                <>
                  <TaskCard icon={BookOpen} label={t(lang, 'nav_learn_word')} desc={t(lang, 'learn_desc_start_now')} color="#FFF5EB" iconColor="#FF8400" onClick={() => navigateSafely(navigate, '/ebbinghaus')} />
                  <TaskCard icon={Headphones} label={t(lang, 'nav_learn_listen')} desc="正在开发中" color="#F0EBFF" iconColor="#8B5CF6" onClick={() => navigateSafely(navigate, '/listening')} />
                  <TaskCard icon={Mic} label={t(lang, 'nav_learn_speak')} desc="正在开发中" color="#E8F0FF" iconColor="#3B82F6" onClick={() => navigateSafely(navigate, '/speaking')} />
                  <TaskCard icon={BookOpenText} label={t(lang, 'nav_learn_grammar')} desc="长难句功能已开放" color="#E8FFE8" iconColor="#22C55E" onClick={() => navigateSafely(navigate, '/grammar')} />
                </>
              )}
            </div>
          </section>

          {/* 图书馆 */}
          <section className={`flex flex-col gap-2 ${isDesktop ? 'pb-1' : 'pt-1 pb-0'}`}>
            <div className="flex items-center justify-between">
              <h3 className={`${isDesktop ? 'text-[18px]' : 'text-[16px]'} font-bold text-[var(--color-foreground)] font-secondary`}>
                <span className="learn-section-title inline-block">{t(lang, 'learn_library')}</span>
              </h3>
              <button onClick={() => navigateSafely(navigate, '/bookshelf')} className="text-[12px] text-[var(--color-primary)] font-semibold">
                {t(lang, 'learn_all')}
              </button>
            </div>
            <div
              className={isDesktop
                ? 'grid grid-cols-2 gap-3 xl:grid-cols-4'
                : 'flex items-start gap-2 overflow-x-auto overflow-y-hidden pt-1 pb-4 -mx-5 px-5 overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
              }
            >
              {books.map((book) => {
                const classicBook = getClassicBookBySlug(book.shared_book_slug)

                return (
                  <div
                    key={book.id}
                    className={`learn-book-card ${isDesktop ? 'glass-card glass-card-interactive' : 'bg-[var(--color-card)] border border-[var(--color-border)]'} ${
                      isDesktop
                        ? 'w-full max-w-[220px] rounded-[24px] p-2.5'
                        : 'shrink-0 w-[92px] rounded-[16px] p-1.5'
                    }`}
                    style={isDesktop ? undefined : { boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)' }}
                    onClick={() => openLibraryBook(book)}
                  >
                    <div className={`${isDesktop ? 'mb-3 rounded-[18px]' : 'mb-1.5 rounded-[12px]'} overflow-hidden`}>
                      {classicBook ? (
                        <div className={isDesktop ? 'aspect-[5/7]' : 'aspect-[4/5.2]'}>
                          <ClassicBookCover book={classicBook} compact />
                        </div>
                      ) : (
                        <div className={`glass-card-soft flex items-center justify-center ${isDesktop ? 'aspect-[5/7] rounded-[18px]' : 'aspect-[4/5.2] rounded-[12px]'}`}>
                          <span className={isDesktop ? 'text-[30px]' : 'text-[20px]'}>{book.cover_emoji || '📘'}</span>
                        </div>
                      )}
                    </div>
                    <span
                      className={`block text-center font-medium text-[var(--color-foreground)] ${
                        isDesktop
                          ? 'line-clamp-2 text-[12px]'
                          : 'line-clamp-3 min-h-[3.75rem] text-[10px] leading-[1.25]'
                      }`}
                    >
                      {book.title}
                    </span>
                  </div>
                )
              })}
              {books.length === 0 && (
                <button
                  onClick={() => navigateSafely(navigate, '/bookshelf')}
                  className={`${isDesktop ? 'col-span-4' : 'shrink-0 w-full'} h-[120px] rounded-xl border border-dashed border-[var(--color-border)] text-[13px] text-[var(--color-muted)]`}
                >
                  {t(lang, 'learn_no_books')}
                </button>
              )}
            </div>
          </section>

          {!isDesktop && (
            <section className="flex flex-col gap-2 -mt-4">
              <div className="rounded-[var(--radius-lg)] bg-[var(--color-card)] px-4 py-4" style={{ boxShadow: 'var(--shadow-card)' }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Flame size={18} className="text-[var(--color-primary)]" />
                    <span className="learn-section-title inline-block text-[16px] font-bold text-[var(--color-foreground)] font-secondary">{t(lang, 'learn_heat')}</span>
                  </div>
                  <span className="shrink-0 text-[12px] text-[var(--color-primary)] font-semibold flex items-center gap-1">
                    🔥 {tf(lang, 'learn_streak', { days: streakDays })}
                  </span>
                </div>
                <div className="w-full px-1 py-1">
                  <HeatMap
                    data={heatmapLevels}
                    fitToWidth
                    gapPx={5}
                    maxCellSizePx={24}
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        {/* 右侧栏（仅桌面端） */}
        {isDesktop && (
          <div className="flex flex-col gap-5">
            {/* 学习热度卡片 */}
            <SpotlightCard
              className="learn-side-card bg-[var(--color-card)] border border-[var(--color-border)] !p-5"
              spotlightColor="rgba(255, 132, 0, 0.12)"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-[var(--color-primary)]" />
                  <span className="text-[16px] font-bold text-[var(--color-foreground)] font-secondary">{t(lang, 'learn_heat')}</span>
                </div>
                <span className="text-[12px] text-[var(--color-primary)] font-semibold flex items-center gap-1">
                  🔥 {tf(lang, 'learn_streak', { days: streakDays })}
                </span>
              </div>
              <HeatMap data={heatmapLevels} />
            </SpotlightCard>

            {/* 快捷操作卡片 */}
            <SpotlightCard
              className="learn-side-card bg-[var(--color-card)] border border-[var(--color-border)] !p-5"
              spotlightColor="rgba(139, 92, 246, 0.12)"
            >
              <h4 className="text-[15px] font-bold text-[var(--color-foreground)] mb-3">{t(lang, 'learn_quick')}</h4>
              <div className="flex flex-col gap-2">
                {[
                  { label: t(lang, 'nav_vocab_flashcard'), path: '/ebbinghaus', color: '#FF8400' },
                  { label: t(lang, 'nav_vocab_spelling'), path: '/spelling-game', color: '#8B5CF6' },
                  { label: t(lang, 'learn_word_match'), path: '/word-match', color: '#3B82F6' },
                  { label: t(lang, 'learn_vocab_test'), path: '/vocab-test', color: '#22C55E' },
                  { label: t(lang, 'learn_settings'), path: '/learning-settings', color: '#64748B' },
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigateSafely(navigate, item.path)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--color-background-secondary)] hover:bg-[var(--color-background-secondary)]/80 transition-all text-left group"
                  >
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[13px] font-medium text-[var(--color-foreground)] group-hover:translate-x-0.5 transition-transform">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </SpotlightCard>
          </div>
        )}
      </div>

    </div>
  )
}

/* ===== 桌面端任务卡片 —— 带 SpotlightCard 效果 ===== */
interface DesktopTaskCardProps {
  icon: React.ElementType
  label: string
  desc: string
  color: string
  onClick?: () => void
}

function DesktopTaskCard({ icon: Icon, label, desc, color, onClick }: DesktopTaskCardProps) {
  return (
    <SpotlightCard
      className="learn-task-card bg-[var(--color-card)] border border-[var(--color-border)] !p-0 cursor-pointer hover:scale-[1.02] hover:shadow-lg"
      spotlightColor={`${color}25`}
    >
      <div className="flex flex-col items-center gap-2.5 py-5 px-3" onClick={onClick}>
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon size={22} style={{ color }} />
        </div>
        <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{label}</span>
        <span className="text-[12px] text-[var(--color-muted)]">{desc}</span>
      </div>
    </SpotlightCard>
  )
}

/* ===== 移动端任务卡片（保持原有样式）===== */
interface TaskCardProps {
  icon: React.ElementType
  label: string
  desc: string
  color: string
  iconColor: string
  onClick?: () => void
}

function TaskCard({ icon: Icon, label, desc, color, iconColor, onClick }: TaskCardProps) {
  return (
    <div
      className="learn-task-card min-w-0 flex flex-col items-center gap-2 py-4 px-2 rounded-[var(--radius-lg)] bg-[var(--color-card)] cursor-pointer active:scale-[0.96] transition-transform"
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={onClick}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center"
        style={{ backgroundColor: color }}
      >
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <span className="w-full text-center text-[13px] font-medium text-[var(--color-foreground)]">{label}</span>
      <span className="w-full text-center text-[11px] leading-[1.35] text-[var(--color-muted)]">{desc}</span>
    </div>
  )
}
