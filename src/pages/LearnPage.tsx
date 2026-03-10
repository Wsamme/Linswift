/**
 * 学习页（首页）—— 已接入 AI + Supabase
 *
 * 功能：
 * 1. AI 生成个性化欢迎问候和励志名言
 * 2. 学习热度图（从 study_records 读取，降级为 mock）
 * 3. 连续学习天数（从 study_records 计算）
 * 4. 今日任务四宫格（跳转到各模块）
 * 5. 图书馆推荐（跳转到书架页）
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Flame, BookOpenText, Headphones, Mic, BookOpen,
  Loader2, RefreshCw, Quote,
} from 'lucide-react'
import HeatMap from '../components/common/HeatMap'
import { getDailyRecommendation, type DailyRecommendation } from '../services/gemini'
import { useAuth } from '../contexts/AuthContext'
import { useStudyRecords, type HeatmapCell } from '../hooks/useStudyRecords'

export default function LearnPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { getHeatmapData, getStreakDays } = useStudyRecords()

  // ===== AI 每日推荐状态 =====
  const [recommendation, setRecommendation] = useState<DailyRecommendation | null>(null)
  const [isLoadingRec, setIsLoadingRec] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ===== 学习数据状态 =====
  const [heatmapLevels, setHeatmapLevels] = useState<number[]>([])
  const [streakDays, setStreakDays] = useState(0)

  // ===== 页面加载时获取 AI 推荐 + 学习数据 =====
  useEffect(() => {
    loadRecommendation()
    loadStudyData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 获取学习数据 =====
  const loadStudyData = async () => {
    try {
      // 获取热度图（最近 36 天 = 3行 x 12列）
      const cells: HeatmapCell[] = await getHeatmapData(36)
      if (cells.length > 0) {
        setHeatmapLevels(cells.map(c => c.level))
      }
      // 获取连续天数
      const streak = await getStreakDays()
      setStreakDays(streak)
    } catch {
      // 数据库未就绪时静默失败，使用 HeatMap 的默认 mock 数据
    }
  }

  // ===== 获取 AI 每日推荐 =====
  const loadRecommendation = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoadingRec(true)
    }

    try {
      const rec = await getDailyRecommendation()
      setRecommendation(rec)
    } catch {
      console.warn('AI 推荐加载失败')
    } finally {
      setIsLoadingRec(false)
      setIsRefreshing(false)
    }
  }

  // 显示名称
  const displayName = user?.user_metadata?.username || user?.email?.split('@')[0] || ''

  return (
    <div className="px-5 pb-4">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between py-4">
        <h1 className="text-[22px] font-bold text-[var(--color-foreground)]">Linswift</h1>
        <div className="w-10 h-10 rounded-full bg-[var(--color-background-secondary)] flex items-center justify-center">
          <Settings size={20} className="text-[var(--color-muted)]" />
        </div>
      </div>

      {/* ===== AI 欢迎 Banner ===== */}
      <div
        className="rounded-[var(--radius-lg)] p-5 mb-5 text-white relative overflow-hidden"
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
            <h2 className="text-[22px] font-bold leading-tight">Ready to learn English?</h2>

            <div className="mt-3 p-3 bg-white/15 rounded-[12px] backdrop-blur-sm">
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
            <h2 className="text-[22px] font-bold leading-tight">Ready to learn English?</h2>
            <div className="flex items-center gap-3 mt-3 text-[12px] opacity-80">
              <span>🔥 连续学习 {streakDays} 天</span>
            </div>
          </>
        )}
      </div>

      {/* ===== 学习热度 ===== */}
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
        {/* 传入真实数据（如果有），否则 HeatMap 会使用内置 mock */}
        <HeatMap data={heatmapLevels.length > 0 ? heatmapLevels : undefined} />
      </div>

      {/* ===== 今日任务 ===== */}
      <div className="mb-5">
        <h3 className="text-[16px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">今日任务</h3>
        <div className="grid grid-cols-4 gap-3">
          <TaskCard icon={BookOpen} label="背单词" desc="开始学习" color="#FFF5EB" iconColor="#FF8400" onClick={() => navigate('/ebbinghaus')} />
          <TaskCard icon={Headphones} label="听力" desc="练习听力" color="#F0EBFF" iconColor="#8B5CF6" onClick={() => navigate('/listening')} />
          <TaskCard icon={Mic} label="口语" desc="口语训练" color="#E8F0FF" iconColor="#3B82F6" onClick={() => navigate('/speaking')} />
          <TaskCard icon={BookOpenText} label="语法" desc="知识树" color="#E8FFE8" iconColor="#22C55E" onClick={() => navigate('/grammar')} />
        </div>
      </div>

      {/* ===== 图书馆 ===== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[16px] font-bold text-[var(--color-foreground)] font-secondary">图书馆</h3>
          <button onClick={() => navigate('/bookshelf')} className="text-[12px] text-[var(--color-primary)] font-semibold">
            全部 →
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
          {['The Great Gatsby', 'Sapiens', 'Steve Jobs'].map((title, i) => (
            <div
              key={i}
              className="shrink-0 w-[130px] h-[170px] rounded-[var(--radius-md)] bg-[var(--color-primary-light)] flex flex-col items-center justify-center p-3 cursor-pointer active:scale-[0.96] transition-transform"
              style={{ boxShadow: 'var(--shadow-card)' }}
              onClick={() => navigate('/bookshelf')}
            >
              <div className="w-[80px] h-[100px] rounded-[8px] bg-[var(--color-primary)]/20 mb-2 flex items-center justify-center">
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
  )
}

/* ===== 今日任务卡片子组件 ===== */
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
