/**
 * 学习页（首页）—— 已接入 AI + Supabase
 * 支持桌面端宽屏布局 + SpotlightCard 动效
 *
 * 功能：
 * 1. AI 生成个性化欢迎问候和励志名言
 * 2. 学习热度图（从 study_records 读取，降级为 mock）
 * 3. 连续学习天数（从 study_records 计算）
 * 4. 今日任务四宫格（跳转到各模块）
 * 5. 图书馆推荐（跳转到书架页）
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Flame, BookOpenText, Headphones, Mic, BookOpen,
  Loader2, RefreshCw, Quote,
} from 'lucide-react'
import HeatMap from '../components/common/HeatMap'
import SpotlightCard from '../components/reactbits/SpotlightCard'
import { getDailyRecommendation, type DailyRecommendation } from '../services/gemini'
import { useAuth } from '../contexts/AuthContext'
import { useStudyRecords, type HeatmapCell } from '../hooks/useStudyRecords'
import { useMediaQuery } from '../hooks/useMediaQuery'

// 模块级缓存：页面切换后再回来不会重新请求
let cachedRecommendation: DailyRecommendation | null = null
let cachedHeatmapLevels: number[] = []
let cachedStreakDays = 0
let hasLoaded = false

export default function LearnPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { getHeatmapData, getStreakDays } = useStudyRecords()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [recommendation, setRecommendation] = useState<DailyRecommendation | null>(cachedRecommendation)
  const [isLoadingRec, setIsLoadingRec] = useState(!hasLoaded)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [heatmapLevels, setHeatmapLevels] = useState<number[]>(cachedHeatmapLevels)
  const [streakDays, setStreakDays] = useState(cachedStreakDays)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  useEffect(() => {
    if (!hasLoaded) {
      loadRecommendation()
      loadStudyData()
      hasLoaded = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadStudyData = async () => {
    try {
      const cells: HeatmapCell[] = await getHeatmapData(36)
      if (!isMounted.current) return
      if (cells.length > 0) {
        const levels = cells.map(c => c.level)
        setHeatmapLevels(levels)
        cachedHeatmapLevels = levels
      }
      const streak = await getStreakDays()
      if (!isMounted.current) return
      setStreakDays(streak)
      cachedStreakDays = streak
    } catch {
      // 降级为默认 mock 数据
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

  return (
    <div className={isDesktop ? '' : 'px-5 pb-4'}>
      {/* ===== Header（仅移动端显示，桌面端已有侧边导航 logo）===== */}
      {!isDesktop && (
        <div className="flex items-center justify-between py-4">
          <h1 className="text-[22px] font-bold text-[var(--color-foreground)]">Linswift</h1>
          <div className="w-10 h-10 rounded-full bg-[var(--color-background-secondary)] flex items-center justify-center">
            <Settings size={20} className="text-[var(--color-muted)]" />
          </div>
        </div>
      )}

      {/* ===== 桌面端双栏 / 移动端单栏 ===== */}
      <div className={isDesktop ? 'grid grid-cols-[1fr_340px] gap-6' : ''}>
        {/* 左主区域 */}
        <div>
          {/* AI 欢迎 Banner */}
          <div
            className="rounded-2xl p-5 mb-5 text-white relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #FF8400, #FF9E33)' }}
          >
            {isLoadingRec ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={24} className="animate-spin text-white/70" />
                <span className="ml-2 text-[13px] text-white/70">AI 正在准备今日内容...</span>
              </div>
            ) : recommendation ? (
              <>
                <p className="text-[13px] opacity-90 mb-1">
                  {recommendation.greeting}{displayName ? `, ${displayName}` : ''}
                </p>
                <h2 className={`${isDesktop ? 'text-[28px]' : 'text-[22px]'} font-bold leading-tight`}>
                  Ready to learn English?
                </h2>

                <div className="mt-3 p-3 bg-white/15 rounded-xl backdrop-blur-sm">
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
                  Good Morning! 👋{displayName ? ` ${displayName}` : ''}
                </p>
                <h2 className={`${isDesktop ? 'text-[28px]' : 'text-[22px]'} font-bold leading-tight`}>
                  Ready to learn English?
                </h2>
                <div className="flex items-center gap-3 mt-3 text-[12px] opacity-80">
                  <span>🔥 连续学习 {streakDays} 天</span>
                </div>
              </>
            )}
          </div>

          {/* 今日任务 —— 桌面端 SpotlightCard */}
          <div className="mb-5">
            <h3 className={`${isDesktop ? 'text-[18px]' : 'text-[16px]'} font-bold text-[var(--color-foreground)] mb-3 font-secondary`}>
              今日任务
            </h3>
            <div className={`grid ${isDesktop ? 'grid-cols-4' : 'grid-cols-4'} gap-3`}>
              {isDesktop ? (
                <>
                  <DesktopTaskCard icon={BookOpen} label="背单词" desc="艾宾浩斯记忆法" color="#FF8400" onClick={() => navigate('/ebbinghaus')} />
                  <DesktopTaskCard icon={Headphones} label="听力" desc="听写 · 随行听" color="#8B5CF6" onClick={() => navigate('/listening')} />
                  <DesktopTaskCard icon={Mic} label="口语" desc="AI 对话训练" color="#3B82F6" onClick={() => navigate('/speaking')} />
                  <DesktopTaskCard icon={BookOpenText} label="语法" desc="语法知识树" color="#22C55E" onClick={() => navigate('/grammar')} />
                </>
              ) : (
                <>
                  <TaskCard icon={BookOpen} label="背单词" desc="开始学习" color="#FFF5EB" iconColor="#FF8400" onClick={() => navigate('/ebbinghaus')} />
                  <TaskCard icon={Headphones} label="听力" desc="练习听力" color="#F0EBFF" iconColor="#8B5CF6" onClick={() => navigate('/listening')} />
                  <TaskCard icon={Mic} label="口语" desc="口语训练" color="#E8F0FF" iconColor="#3B82F6" onClick={() => navigate('/speaking')} />
                  <TaskCard icon={BookOpenText} label="语法" desc="知识树" color="#E8FFE8" iconColor="#22C55E" onClick={() => navigate('/grammar')} />
                </>
              )}
            </div>
          </div>

          {/* 图书馆 */}
          <div className={isDesktop ? 'mb-5' : ''}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`${isDesktop ? 'text-[18px]' : 'text-[16px]'} font-bold text-[var(--color-foreground)] font-secondary`}>
                图书馆
              </h3>
              <button onClick={() => navigate('/bookshelf')} className="text-[12px] text-[var(--color-primary)] font-semibold">
                全部 →
              </button>
            </div>
            <div className={isDesktop
              ? 'grid grid-cols-4 gap-3'
              : 'flex gap-3 overflow-x-auto pb-2 -mx-5 px-5'
            }>
              {['The Great Gatsby', 'Sapiens', 'Steve Jobs', ...(isDesktop ? ['1984'] : [])].map((title, i) => (
                <div
                  key={i}
                  className={`${isDesktop ? 'w-full' : 'shrink-0 w-[130px]'} h-[170px] rounded-xl bg-[var(--color-primary-light)] flex flex-col items-center justify-center p-3 cursor-pointer active:scale-[0.96] transition-transform hover:shadow-lg`}
                  style={{ boxShadow: 'var(--shadow-card)' }}
                  onClick={() => navigate('/bookshelf')}
                >
                  <div className="w-[80px] h-[100px] rounded-lg bg-[var(--color-primary)]/20 mb-2 flex items-center justify-center">
                    <BookOpen size={28} className="text-[var(--color-primary)]" />
                  </div>
                  <span className="text-[11px] font-medium text-[var(--color-foreground)] text-center line-clamp-1">
                    {title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧栏（仅桌面端） */}
        {isDesktop && (
          <div className="flex flex-col gap-5">
            {/* 学习热度卡片 */}
            <SpotlightCard
              className="bg-[var(--color-card)] border border-[var(--color-border)] !p-5"
              spotlightColor="rgba(255, 132, 0, 0.12)"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-[var(--color-primary)]" />
                  <span className="text-[16px] font-bold text-[var(--color-foreground)] font-secondary">学习热度</span>
                </div>
                <span className="text-[12px] text-[var(--color-primary)] font-semibold flex items-center gap-1">
                  🔥 连续 {streakDays} 天
                </span>
              </div>
              <HeatMap data={heatmapLevels.length > 0 ? heatmapLevels : undefined} />
            </SpotlightCard>

            {/* 快捷操作卡片 */}
            <SpotlightCard
              className="bg-[var(--color-card)] border border-[var(--color-border)] !p-5"
              spotlightColor="rgba(139, 92, 246, 0.12)"
            >
              <h4 className="text-[15px] font-bold text-[var(--color-foreground)] mb-3">快捷操作</h4>
              <div className="flex flex-col gap-2">
                {[
                  { label: '闪卡复习', path: '/ebbinghaus', color: '#FF8400' },
                  { label: '拼写游戏', path: '/spelling-game', color: '#8B5CF6' },
                  { label: '单词匹配', path: '/word-match', color: '#3B82F6' },
                  { label: '词汇测试', path: '/vocab-test', color: '#22C55E' },
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
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

      {/* 移动端热度图（不在右侧栏） */}
      {!isDesktop && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame size={18} className="text-[var(--color-primary)]" />
              <span className="text-[16px] font-bold text-[var(--color-foreground)] font-secondary">学习热度</span>
            </div>
            <span className="text-[12px] text-[var(--color-primary)] font-semibold flex items-center gap-1">
              🔥 连续 {streakDays} 天
            </span>
          </div>
          <HeatMap data={heatmapLevels.length > 0 ? heatmapLevels : undefined} />
        </div>
      )}
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
      className="bg-[var(--color-card)] border border-[var(--color-border)] !p-0 cursor-pointer hover:scale-[1.02] hover:shadow-lg"
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
      className="flex flex-col items-center gap-2 py-4 px-2 rounded-[var(--radius-lg)] bg-[var(--color-card)] cursor-pointer active:scale-[0.96] transition-transform"
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={onClick}
    >
      <div
        className="w-9 h-9 rounded-[10px] flex items-center justify-center"
        style={{ backgroundColor: color }}
      >
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <span className="text-[13px] font-medium text-[var(--color-foreground)]">{label}</span>
      <span className="text-[11px] text-[var(--color-muted)]">{desc}</span>
    </div>
  )
}
