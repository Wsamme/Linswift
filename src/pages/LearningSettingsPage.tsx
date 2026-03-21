/**
 * 学习设置页
 *
 * 功能：
 * 1. 每日学习目标选择（10/20/30/50 个新单词）
 * 2. 学习模式切换（听力优先 / 阅读优先 / 拼写优先）
 * 3. 发音设置入口（跳转到发音设置子页面）
 * 4. 自动播放单词、显示例句、复习提醒等开关
 *
 * 所有设置保存到 localStorage，下次打开自动恢复
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Volume2, Loader2,
} from 'lucide-react'
import { useTTSSettings } from '../hooks/useTTSSettings'
import { useThemeSettings } from '../hooks/useThemeSettings'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'
import SettingsDesktopShell from '../components/settings/SettingsDesktopShell'
import { getLanguageLabel } from '../lib/i18n'

// localStorage key
const LEARN_SETTINGS_KEY = 'linswift_learn_settings'

// 学习设置的类型
interface LearnSettings {
  dailyGoal: number           // 每日新学单词数
  learningMode: 'listen' | 'read' | 'write'  // 学习模式
  showExamples: boolean       // 显示例句
  reviewReminder: boolean     // 复习提醒
  reviewCycleDays: 7 | 15     // 艾宾浩斯复习制
}

// 默认值
const DEFAULT_LEARN: LearnSettings = {
  dailyGoal: 20,
  learningMode: 'listen',
  showExamples: false,
  reviewReminder: true,
  reviewCycleDays: 7,
}

// 从 localStorage 读取
function loadLearnSettings(): LearnSettings {
  try {
    const raw = localStorage.getItem(LEARN_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_LEARN }
    const merged = { ...DEFAULT_LEARN, ...JSON.parse(raw) } as LearnSettings
    merged.reviewCycleDays = merged.reviewCycleDays === 15 ? 15 : 7
    return merged
  } catch {
    return { ...DEFAULT_LEARN }
  }
}

// 保存到 localStorage
function saveLearnSettings(s: LearnSettings) {
  localStorage.setItem(LEARN_SETTINGS_KEY, JSON.stringify(s))
}

// 每日目标选项
const goalOptions = [10, 20, 30, 50]

// 学习模式选项
const modeOptions = [
  { key: 'listen' as const, icon: '👂', label: '听力优先' },
  { key: 'read' as const, icon: '📖', label: '阅读优先' },
  { key: 'write' as const, icon: '✍️', label: '拼写优先' },
]

export default function LearningSettingsPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const { settings: ttsSettings, toggleSetting } = useTTSSettings()
  const { settings: themeSettings, updateSettings: updateThemeSettings } = useThemeSettings()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // ===== 学习设置状态 =====
  const [learn, setLearn] = useState<LearnSettings>(loadLearnSettings)
  const [remoteLoading, setRemoteLoading] = useState(true)
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // 每次修改后自动保存
  useEffect(() => {
    saveLearnSettings(learn)
  }, [learn])

  // 首次读取 Supabase user_settings（覆盖本地可映射字段）
  useEffect(() => {
    async function loadRemote() {
      if (!user) {
        setRemoteLoading(false)
        return
      }
      setRemoteLoading(true)
      const { data, error } = await supabase
        .from('user_settings')
        .select('daily_goal_minutes, auto_translate, notification_enabled, review_cycle_days')
        .eq('user_id', user.id)
        .single()
      if (!error && data) {
        setLearn(prev => ({
          ...prev,
          dailyGoal: data.daily_goal_minutes ?? prev.dailyGoal,
          showExamples: data.auto_translate ?? prev.showExamples,
          reviewReminder: data.notification_enabled ?? prev.reviewReminder,
          reviewCycleDays: data.review_cycle_days === 15 ? 15 : 7,
        }))
      }
      setRemoteLoading(false)
    }
    loadRemote()
  }, [user])

  // 同步可映射字段到 Supabase（学习模式暂存本地）
  useEffect(() => {
    if (!user || remoteLoading) return
    const timer = setTimeout(async () => {
      setSyncState('saving')
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          daily_goal_minutes: learn.dailyGoal,
          auto_translate: learn.showExamples,
          notification_enabled: learn.reviewReminder,
          review_cycle_days: learn.reviewCycleDays,
        }, { onConflict: 'user_id' })
      if (error) setSyncState('error')
      else {
        setSyncState('saved')
        setTimeout(() => setSyncState('idle'), 1200)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [learn.dailyGoal, learn.showExamples, learn.reviewReminder, learn.reviewCycleDays, user, remoteLoading])

  // 更新某个字段
  const update = (partial: Partial<LearnSettings>) => {
    setLearn(prev => ({ ...prev, ...partial }))
  }

  const syncIndicator = (
    <div className={`text-[12px] ${isDesktop ? 'glass-card-elevated rounded-full px-4 py-2' : ''} text-[var(--color-muted)]`}>
      {remoteLoading && <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />加载中</span>}
      {!remoteLoading && syncState === 'saving' && <span>同步中...</span>}
      {!remoteLoading && syncState === 'saved' && <span className="text-[var(--color-success)]">已同步</span>}
      {!remoteLoading && syncState === 'error' && <span className="text-[var(--color-error)]">同步失败</span>}
    </div>
  )

  const activeModeLabel = modeOptions.find((item) => item.key === learn.learningMode)?.label || '听力优先'

  const planCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className="space-y-1">
        <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>学习计划</h2>
        <p className="text-[12px] text-[var(--color-muted-light)]">这里只保留真正影响学习任务分配和复习节奏的设置。</p>
      </div>

      <div className="space-y-3 rounded-[22px] bg-white/35 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[var(--color-foreground)]">每日新词目标</span>
          <span className="text-[12px] text-[var(--color-primary)]">{learn.dailyGoal} 个</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {goalOptions.map(g => (
            <button
              key={g}
              onClick={() => update({ dailyGoal: g })}
              className={`rounded-full py-2 text-[13px] font-medium transition-colors ${
                learn.dailyGoal === g
                  ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                  : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} text-[var(--color-primary)]`
              }`}
            >
              {g}个
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] bg-white/35 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[var(--color-foreground)]">复习周期</span>
          <span className="text-[12px] text-[var(--color-primary)]">{learn.reviewCycleDays} 天制</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[7, 15].map((day) => (
            <button
              key={day}
              onClick={() => update({ reviewCycleDays: day as 7 | 15 })}
              className={`rounded-full py-3 text-[13px] font-medium transition-colors ${
                learn.reviewCycleDays === day
                  ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                  : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} text-[var(--color-primary)]`
              }`}
            >
              {day}天制
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const modeCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>学习模式</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">只保留一个主偏好入口，决定你在背词页优先看到的训练方式。</p>
      <div className={`grid ${isDesktop ? 'grid-cols-3' : 'grid-cols-3'} gap-3`}>
        {modeOptions.map(m => (
          <button
            key={m.key}
            onClick={() => update({ learningMode: m.key })}
            className={`flex flex-col items-center gap-2 rounded-[20px] py-4 transition-colors ${
              learn.learningMode === m.key
                ? 'bg-[var(--color-primary)] text-white shadow-[0_16px_28px_rgba(255,132,0,0.2)]'
                : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} text-[var(--color-primary)]`
            }`}
          >
            <span className="text-[22px]">{m.icon}</span>
            <span className="text-[13px] font-medium">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const themeCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>主题设置</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">这里只保留常用主题切换；更细的语言、字体和主题色继续去主题设置页。</p>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { key: 'light' as const, label: '浅色', icon: '☀️' },
          { key: 'dark' as const, label: '深色', icon: '🌙' },
          { key: 'system' as const, label: '跟随系统', icon: '📱' },
        ].map((mode) => (
          <button
            key={mode.key}
            onClick={() => updateThemeSettings({ mode: mode.key })}
            className={`flex flex-col items-center gap-2 rounded-[20px] py-3 transition-colors ${
              themeSettings.mode === mode.key
                ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} text-[var(--color-primary)]`
            }`}
          >
            <span className="text-[20px]">{mode.icon}</span>
            <span className="text-[12px] font-medium">{mode.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-[20px] bg-white/35 px-4 py-3 text-[12px] text-[var(--color-muted)]">
        <div>
          <p className="font-medium text-[var(--color-foreground)]">
          {themeSettings.mode === 'system' ? '跟随系统' : themeSettings.mode === 'dark' ? '深色模式' : '浅色模式'}
          </p>
          <p className="mt-1">语言：{getLanguageLabel(themeSettings.language)}</p>
        </div>
        <button
          onClick={() => navigate('/theme-settings')}
          className="rounded-full bg-[var(--color-primary-light)] px-4 py-2 text-[12px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
        >
          更多主题
        </button>
      </div>
    </div>
  )

  const featureCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] overflow-hidden' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden'}`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className={`${isDesktop ? 'px-6 pt-6 pb-4' : 'px-5 pt-5 pb-4'}`}>
        <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>朗读与阅读</h2>
        <p className="mt-1 text-[12px] text-[var(--color-muted-light)]">这里保留真正会影响学习过程的开关，删除无实际配置作用的跳转项。</p>
      </div>

      <button
        onClick={() => navigate('/pronunciation-settings')}
        className={`w-full flex items-center justify-between ${isDesktop ? 'px-6 py-5 hover:bg-white/40' : 'px-5 py-3.5 active:bg-[var(--color-background-secondary)]'} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <Volume2 size={18} className="text-[var(--color-muted)]" />
          <span className={`${isDesktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>发音设置</span>
        </div>
        <ChevronRight size={16} className="text-[var(--color-muted)]" />
      </button>

      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label="🔄 自动播放单词" value={ttsSettings.autoPlay} onChange={() => toggleSetting('autoPlay')} desktop={isDesktop} />
      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label="📝 显示例句" value={learn.showExamples} onChange={() => update({ showExamples: !learn.showExamples })} desktop={isDesktop} />
      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label="⏰ 复习提醒" value={learn.reviewReminder} onChange={() => update({ reviewReminder: !learn.reviewReminder })} desktop={isDesktop} />
    </div>
  )

  if (isDesktop) {
    return (
      <SettingsDesktopShell
        title="学习设置"
        description="把目标、模式、复习节奏和朗读相关开关收进桌面工作台，避免继续使用手机单列设置页。"
        onBack={goBack}
        sideTitle="同步状态"
        sideDescription="只有每日目标、复习周期、显示例句和复习提醒会同步到云端。学习模式和主题偏好主要保留在当前设备。"
        sideContent={
          <div className="space-y-6">
            {syncIndicator}
            <div className="glass-card-elevated rounded-[28px] p-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">当前生效</p>
              <div className="mt-4 space-y-3 text-[14px] text-[var(--color-foreground)]/82">
                <div className="rounded-[18px] bg-white/50 px-4 py-3">每日目标：{learn.dailyGoal} 个新词</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3">学习模式：{activeModeLabel}</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3">复习周期：{learn.reviewCycleDays} 天制</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3">例句：{learn.showExamples ? '显示' : '关闭'} · 提醒：{learn.reviewReminder ? '开启' : '关闭'}</div>
              </div>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-6">
          <div className="space-y-6">
            {planCard}
            {modeCard}
          </div>
          <div className="space-y-6">
            {featureCard}
            {themeCard}
          </div>
        </div>
      </SettingsDesktopShell>
    )
  }

  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] flex flex-col">
        {/* ===== 顶部导航 ===== */}
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-[var(--color-card)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">
            学习设置
          </h1>
          <div className="ml-auto text-[11px] text-[var(--color-muted)]">{syncIndicator}</div>
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
          {planCard}
          {modeCard}
          {themeCard}

          {featureCard}
        </div>
      </div>
    </div>
  )
}

// ========== 通用 Toggle 行组件 ==========
interface ToggleRowProps {
  label: string
  value: boolean
  onChange: () => void
  desktop?: boolean
}

function ToggleRow({ label, value, onChange, desktop = false }: ToggleRowProps) {
  return (
    <div className={`flex items-center justify-between ${desktop ? 'px-6 py-5' : 'px-5 py-3.5'}`}>
      <span className={`${desktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>{label}</span>
      <button
        onClick={onChange}
        className={`w-[44px] h-[26px] rounded-full flex items-center transition-colors duration-200 ${
          value ? 'bg-[var(--color-primary)] justify-end' : 'bg-[var(--color-border-dark)] justify-start'
        }`}
      >
        <div className={`w-[20px] h-[20px] rounded-full bg-white mx-[3px] shadow-sm transition-transform`} />
      </button>
    </div>
  )
}
