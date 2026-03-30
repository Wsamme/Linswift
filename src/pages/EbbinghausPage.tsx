import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Brain, Gamepad2, Sparkles, BookOpen, RotateCcw, Plus,
} from 'lucide-react'
import { getEbbinghausForecastPlan, normalizeReviewCycleDays, type ReviewCycleDays } from '../lib/ebbinghaus'
import { buildTodayStudyQueue } from '../lib/vocabStudyQueue'
import { getDailyNewWordGoal } from '../lib/learnSettings'
import { buildAggregatedTodayStudyQueue, fetchUserVocabPlanningContext } from '../lib/vocabTodayPlanner'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'

/**
 * 艾宾浩斯记忆规划看板 —— 接入 Supabase
 *
 * 数据来源：
 * - 统计数字从 user_vocabulary 计算
 * - 7天计划从词汇的 next_review_at 计算
 * - 今日学习清单 = 今天到期的词汇
 */

export default function EbbinghausPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [unmasteredCount, setUnmasteredCount] = useState(0)
  const [newTodayCount, setNewTodayCount] = useState(0)
  const [reviewCount, setReviewCount] = useState(0)
  const [masteredCount, setMasteredCount] = useState(0)
  const [totalWords, setTotalWords] = useState(0)
  const [todayDoneCount, setTodayDoneCount] = useState(0)
  const [weeklyPlan, setWeeklyPlan] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [reviewCycleDays, setReviewCycleDays] = useState<ReviewCycleDays>(7)
  const dailyNewWordGoal = getDailyNewWordGoal()

  function getLocalDayRange() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    return {
      todayStartIso: todayStart.toISOString(),
      tomorrowStartIso: tomorrowStart.toISOString(),
    }
  }

  // 加载看板统计（聚合计数 + 轻量字段）
  useEffect(() => {
    async function loadBoardStats() {
      if (!user) {
        setLoading(false)
        return
      }
      setLoading(true)
      const { todayStartIso, tomorrowStartIso } = getLocalDayRange()

      const [
        totalRes,
        unmasteredRes,
        masteredRes,
        planRes,
        todayPlanRowsRes,
        todayReviewsRes,
        settingsRes,
      ] = await Promise.all([
        supabase.from('user_vocabulary').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase
          .from('user_vocabulary')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .lt('mastery_level', 5),
        supabase.from('user_vocabulary').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('mastery_level', 5),
        supabase
          .from('user_vocabulary')
          .select('next_review_at, mastery_level')
          .eq('user_id', user.id)
          .lte('mastery_level', 5),
        supabase
          .from('user_vocabulary')
          .select('id,created_at,review_count,next_review_at')
          .eq('user_id', user.id)
          .lt('mastery_level', 5),
        supabase
          .from('vocabulary_reviews')
          .select('vocabulary_id')
          .eq('user_id', user.id)
          .gte('created_at', todayStartIso)
          .lt('created_at', tomorrowStartIso),
        supabase
          .from('user_settings')
          .select('review_cycle_days')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      const cycleDays = normalizeReviewCycleDays(settingsRes.data?.review_cycle_days)
      const todayRows = todayPlanRowsRes.data || []
      let todayQueue = buildTodayStudyQueue(todayRows, dailyNewWordGoal)
      try {
        const planningContext = await fetchUserVocabPlanningContext(user.id, dailyNewWordGoal)
        todayQueue = buildAggregatedTodayStudyQueue(todayRows, {
          inboxDailyGoal: dailyNewWordGoal,
          setPlans: planningContext.setPlans,
          memberships: planningContext.memberships,
          inboxLabel: '未分组词汇',
        })
      } catch {
        todayQueue = buildTodayStudyQueue(todayRows, dailyNewWordGoal)
      }

      setReviewCycleDays(cycleDays)
      setTotalWords(totalRes.count || 0)
      setUnmasteredCount(unmasteredRes.count || 0)
      setNewTodayCount(todayQueue.newRows.length)
      setReviewCount(todayQueue.dueReviewRows.length)
      setMasteredCount(masteredRes.count || 0)
      const uniqueReviewedToday = new Set((todayReviewsRes.data || []).map((r: { vocabulary_id: number }) => r.vocabulary_id))
      setTodayDoneCount(uniqueReviewedToday.size)
      setWeeklyPlan(getEbbinghausForecastPlan(planRes.data || [], cycleDays, cycleDays))
      setLoading(false)
    }

    loadBoardStats().catch(() => {
      setLoading(false)
    })
  }, [dailyNewWordGoal, user])

  const dayNames = Array.from({ length: reviewCycleDays }, (_, i) => {
    if (i === 0) return '今天'
    if (i === 1) return '明天'
    if (i === 2) return '后天'
    return `第${i + 1}天`
  })

  // ===== 今日学习清单 =====
  const [todayTasks] = useState(() => [
    { type: '新学', label: '新词汇学习', countKey: 'new' as const, icon: Plus, color: '#FF8400' },
    { type: '复习', label: '到期复习', countKey: 'review' as const, icon: RotateCcw, color: '#3B82F6' },
  ])

  const taskCounts = {
    new: newTodayCount,
    review: reviewCount,
  }

  // 今日任务进度（更符合背单词当日学习实际）
  const todayPlanCount = newTodayCount + reviewCount
  const progressPercent = todayPlanCount > 0
    ? Math.min(100, Math.round((todayDoneCount / todayPlanCount) * 100))
    : 0

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">背单词</h1>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-3 gap-3 mx-5 mb-5">
        <StatBox value={String(unmasteredCount)} label="不会" color="#EF4444" loading={loading} />
        <StatBox value={String(todayPlanCount)} label="今日待学" color="#FF8400" loading={loading} />
        <StatBox value={String(masteredCount)} label="已掌握" color="#22C55E" loading={loading} />
      </div>

      {/* ===== 整体进度 ===== */}
      <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">今日学习进度</span>
          <span className="text-[13px] text-[var(--color-primary)] font-bold">
            {todayDoneCount}/{todayPlanCount} 词
          </span>
        </div>
        <div className="h-2.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-muted)]">
          今日计划 = 到期复习 {reviewCount} + 新学 {newTodayCount}（由未分组词汇的全局默认节奏 + 各学习集独立计划共同组成）；“不会” = 所有未完成完整艾宾浩斯周期的词
        </p>
      </div>

      {/* ===== 复习计划看板 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">{reviewCycleDays} 天记忆规划</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5">
          {weeklyPlan.map((count, i) => (
            <div
              key={i}
              className={`shrink-0 w-[80px] p-3 rounded-[var(--radius-sm)] text-center transition-colors ${
                i === 0
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-background-secondary)]'
              }`}
            >
              <p className={`text-[12px] font-semibold mb-1 ${i === 0 ? 'text-white' : 'text-[var(--color-foreground)]'}`}>
                {dayNames[i]}
              </p>
              <p className={`text-[18px] font-bold ${i === 0 ? 'text-white' : 'text-[var(--color-foreground)]'}`}>
                {count}
              </p>
              <p className={`text-[10px] ${i === 0 ? 'text-white/80' : 'text-[var(--color-muted)]'}`}>
                词
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== 学习模式入口 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">选择学习模式</h3>
        <div className="grid grid-cols-3 gap-3">
          <ModeCard icon={BookOpen} label="卡片学习" desc="经典翻卡" color="#FF8400" onClick={() => navigateSafely(navigate, '/flashcard')} />
          <ModeCard icon={Gamepad2} label="游戏记忆" desc="趣味闯关" color="#8B5CF6" onClick={() => navigateSafely(navigate, '/vocab-game')} />
          <ModeCard icon={Sparkles} label="AI 速记" desc="联想记忆" color="#3B82F6" onClick={() => navigateSafely(navigate, '/ai-memo')} />
        </div>
      </div>

      {/* ===== 今日学习清单 ===== */}
      <div className="mx-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary flex items-center gap-2">
          <Brain size={16} className="text-[var(--color-primary)]" /> 今日学习清单
        </h3>
        <div className="space-y-2">
          {todayTasks.map((task, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)]"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${task.color}15` }}
              >
                <task.icon size={18} style={{ color: task.color }} />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{task.label}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{task.type} · {taskCounts[task.countKey]} 词</p>
              </div>
              <button
                onClick={() => navigateSafely(navigate, '/flashcard')}
                className="px-3 py-1.5 bg-[var(--color-primary-light)] rounded-full text-[12px] font-semibold text-[var(--color-primary)]"
              >
                开始
              </button>
            </div>
          ))}

          {/* 若词库为空的提示 */}
          {!loading && totalWords === 0 && (
            <div className="text-center py-6">
              <p className="text-[13px] text-[var(--color-muted)]">
                词库为空，去翻译页收录一些词汇吧
              </p>
              <button
                onClick={() => navigateSafely(navigate, '/app/translate')}
                className="mt-2 text-[13px] text-[var(--color-primary)] font-semibold"
              >
                前往翻译 →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ===== 统计数字组件 ===== */
function StatBox({ value, label, color, loading }: { value: string; label: string; color: string; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
      style={{ boxShadow: 'var(--shadow-card)' }}>
      <span className="text-[22px] font-bold" style={{ color }}>
        {loading ? '-' : value}
      </span>
      <span className="text-[11px] text-[var(--color-muted)]">{label}</span>
    </div>
  )
}

/* ===== 学习模式卡片组件 ===== */
function ModeCard({ icon: Icon, label, desc, color, onClick }: {
  icon: React.ElementType; label: string; desc: string; color: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-2 py-4 px-2 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-[0.96] transition-transform"
      style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <span className="text-[13px] font-semibold text-[var(--color-foreground)]">{label}</span>
      <span className="text-[11px] text-[var(--color-muted)]">{desc}</span>
    </button>
  )
}
