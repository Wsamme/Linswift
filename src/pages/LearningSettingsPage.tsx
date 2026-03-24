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
import { ACCENT_LABELS, ACCENT_FLAGS, SPEED_OPTIONS, type AccentType } from '../lib/tts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'
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

const accentOptions: AccentType[] = ['en-US', 'en-GB', 'en-AU']

const languageOptions = [
  { value: 'zh-CN' as const, label: '简体中文' },
  { value: 'en' as const, label: 'English' },
  { value: 'ja' as const, label: '日本语' },
]

const themeColorOptions = [
  { color: '#FF8400', label: '活力橙' },
  { color: '#3B82F6', label: '蔚蓝' },
  { color: '#8B5CF6', label: '梦幻紫' },
  { color: '#22C55E', label: '清新绿' },
  { color: '#EF4444', label: '热情红' },
  { color: '#EC4899', label: '甜蜜粉' },
]

export default function LearningSettingsPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const {
    settings: ttsSettings,
    toggleSetting,
    setAccent,
    setRate,
    setVolume,
    previewVoice,
  } = useTTSSettings()
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
  const currentModeLabel = themeSettings.mode === 'system'
    ? '跟随系统'
    : themeSettings.mode === 'dark'
      ? '深色'
      : '浅色'
  const currentThemeColorLabel = themeColorOptions.find(
    (item) => item.color === themeSettings.primaryColor
  )?.label || '活力橙'
  const currentSpeedLabel = SPEED_OPTIONS.find((item) => item.value === ttsSettings.rate)?.label || '1.0x'
  const currentFontSize = themeSettings.fontSize

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
      <div className="glass-page h-full overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-8 py-8">
          <div className="rounded-[32px] border border-white/70 bg-[linear-gradient(180deg,rgba(251,248,242,0.96),rgba(246,241,231,0.95))] px-8 py-8 shadow-[0_24px_60px_rgba(33,22,16,0.08)]">
            <div className="mb-8 flex items-start gap-4">
              <button
                onClick={goBack}
                className="inline-flex h-[76px] w-[76px] items-center justify-center rounded-full border border-white/80 bg-white/70 text-[var(--color-foreground)] shadow-[0_12px_28px_rgba(54,32,17,0.08)] backdrop-blur-xl"
              >
                <ChevronLeft size={30} />
              </button>
              <div className="pt-1">
                <p className="text-[22px] font-bold uppercase tracking-[0.18em] text-[#8b8784]">个人设置</p>
                <h1 className="mt-2 text-[60px] font-bold tracking-tight text-[var(--color-foreground)] font-secondary">学习设置</h1>
                <p className="mt-3 max-w-[900px] text-[19px] leading-8 text-[var(--color-muted)]">
                  把目标、节奏、界面主题和朗读设置整理成一套更紧凑的桌面控制面板，和翻译弹窗保持一致的暖灰玻璃视觉。
                </p>
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
              <section className="rounded-[28px] border border-white/75 bg-white/78 p-6 shadow-[0_18px_38px_rgba(45,30,18,0.08)] backdrop-blur-xl">
                <h2 className="text-[34px] font-bold tracking-tight text-[var(--color-foreground)]">学习设置</h2>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <DesktopInfoCard
                    title="同步状态"
                    rows={[
                      ['可同步项', '3 项'],
                      ['本机保留', '2 项'],
                      ['最近同步', remoteLoading ? '加载中' : syncState === 'error' ? '失败' : '今天'],
                    ]}
                  />
                  <DesktopInfoCard
                    title="当前生效"
                    rows={[
                      ['每日目标', `${learn.dailyGoal} 个`],
                      ['复习周期', `${learn.reviewCycleDays} 天制`],
                      ['学习模式', activeModeLabel],
                    ]}
                  />
                </div>

                <div className="mt-4 rounded-[24px] border border-white/70 bg-[rgba(255,248,240,0.82)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                  <h3 className="text-[28px] font-bold text-[var(--color-foreground)]">学习计划</h3>
                  <p className="mt-2 text-[15px] leading-7 text-[var(--color-muted)]">
                    只保留会直接影响每日任务量和复习频率的设置，让计划更短、更清晰。
                  </p>

                  <div className="mt-6">
                    <p className="text-[19px] font-semibold text-[var(--color-foreground)]">每日新词目标</p>
                    <div className="mt-4 flex gap-3">
                      {goalOptions.map((g) => (
                        <button
                          key={g}
                          onClick={() => update({ dailyGoal: g })}
                          className={`inline-flex h-[48px] min-w-[76px] items-center justify-center rounded-[14px] px-5 text-[17px] font-semibold transition-colors ${
                            learn.dailyGoal === g
                              ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_20px_rgba(255,132,0,0.2)]'
                              : 'border border-white/85 bg-white/80 text-[var(--color-primary)]'
                          }`}
                        >
                          {g}个
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-[19px] font-semibold text-[var(--color-foreground)]">复习周期</p>
                    <div className="mt-4 flex gap-3">
                      {[7, 15].map((day) => (
                        <button
                          key={day}
                          onClick={() => update({ reviewCycleDays: day as 7 | 15 })}
                          className={`inline-flex h-[50px] min-w-[144px] items-center justify-center rounded-[15px] px-5 text-[18px] font-semibold transition-colors ${
                            learn.reviewCycleDays === day
                              ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_20px_rgba(255,132,0,0.2)]'
                              : 'border border-white/85 bg-white/80 text-[var(--color-primary)]'
                          }`}
                        >
                          {day}天制
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-white/75 bg-white/78 p-6 shadow-[0_18px_38px_rgba(45,30,18,0.08)] backdrop-blur-xl">
                <h2 className="text-[34px] font-bold tracking-tight text-[var(--color-foreground)]">主题设置</h2>
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-[minmax(0,170px)_minmax(0,176px)_minmax(0,1fr)] gap-4">
                    <DesktopPlainCard
                      title="主题摘要"
                      body="当前主题状态会全局生效，切换语言与主题色后立刻看到变化。"
                    />
                    <DesktopInfoCard
                      title="当前状态"
                      rows={[
                        ['外观模式', currentModeLabel],
                        ['界面语言', getLanguageLabel(themeSettings.language)],
                        ['主题色', currentThemeColorLabel],
                      ]}
                    />
                    <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                      <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">界面语言</h3>
                      <div className="mt-4 flex gap-2">
                        {languageOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => updateThemeSettings({ language: option.value })}
                            className={`inline-flex h-[48px] items-center justify-center rounded-full px-5 text-[16px] font-semibold transition-colors ${
                              themeSettings.language === option.value
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'border border-white/85 bg-white/80 text-[#8a8278]'
                            } ${option.value === 'en' ? 'min-w-[94px]' : option.value === 'ja' ? 'min-w-[104px]' : 'min-w-[126px]'}`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-4">
                    <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                      <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">外观模式</h3>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        {[
                          { key: 'light' as const, label: '浅色', icon: '☀' },
                          { key: 'dark' as const, label: '深色', icon: '☾' },
                          { key: 'system' as const, label: '跟随系统', icon: '▣' },
                        ].map((mode) => (
                          <button
                            key={mode.key}
                            onClick={() => updateThemeSettings({ mode: mode.key })}
                            className={`flex h-[108px] flex-col items-center justify-center gap-2 rounded-[18px] px-3 transition-colors ${
                              themeSettings.mode === mode.key
                                ? 'border-2 border-[var(--color-primary)] bg-[#fff4e8] text-[var(--color-primary)]'
                                : 'border border-white/85 bg-white/80 text-[#8a8278]'
                            }`}
                          >
                            <span className="text-[24px] font-semibold">{mode.icon}</span>
                            <span className={`text-center ${mode.key === 'system' ? 'text-[14px]' : 'text-[17px]'} font-semibold`}>
                              {mode.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                      <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">字体大小</h3>
                      <p className="mt-2 text-[15px] leading-7 text-[var(--color-muted)]">调整应用内的文字显示大小（全局生效）</p>
                      <div className="mt-5 flex items-center gap-4">
                        <span className="text-[18px] font-bold text-[#786f66]">A</span>
                        <div className="relative flex-1">
                          <div className="h-[6px] rounded-full bg-[#b8aca0]" />
                          <div className="absolute left-0 top-0 h-[6px] rounded-full bg-[#7c6a5e]" style={{ width: `${(currentFontSize / 2) * 100}%` }} />
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={1}
                            value={currentFontSize}
                            onChange={(event) => updateThemeSettings({ fontSize: Number(event.target.value) as 0 | 1 | 2 })}
                            className="absolute inset-[-12px_0] h-8 w-full cursor-pointer opacity-0"
                          />
                          <div
                            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-4 border-white bg-[#7c6a5e] shadow-md"
                            style={{ left: `calc(${(currentFontSize / 2) * 100}% - 10px)` }}
                          />
                        </div>
                        <span className="text-[26px] font-bold text-[#786f66]">A</span>
                      </div>
                      <div className="mt-4 flex justify-between text-[16px] font-bold text-[var(--color-primary)]">
                        <button type="button" onClick={() => updateThemeSettings({ fontSize: 0 })}>小</button>
                        <button type="button" onClick={() => updateThemeSettings({ fontSize: 1 })}>标准</button>
                        <button type="button" onClick={() => updateThemeSettings({ fontSize: 2 })}>大</button>
                      </div>
                      <p className="mt-5 text-[18px] text-[var(--color-foreground)]" style={{ fontSize: `${[14, 18, 22][currentFontSize]}px` }}>
                        这是预览文字
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                    <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">主题色</h3>
                    <div className="mt-4 flex items-center justify-between">
                      {themeColorOptions.map((color) => (
                        <button
                          key={color.color}
                          type="button"
                          onClick={() => updateThemeSettings({ primaryColor: color.color })}
                          className={`h-[34px] w-[34px] rounded-full transition-transform ${themeSettings.primaryColor === color.color ? 'scale-110 ring-4 ring-[#2c241f]/18' : ''}`}
                          style={{
                            backgroundColor: color.color,
                            boxShadow: themeSettings.primaryColor === color.color ? '0 0 0 4px #2c241f' : 'none',
                          }}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="mt-6 rounded-[28px] border border-white/75 bg-white/78 p-6 shadow-[0_18px_38px_rgba(45,30,18,0.08)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h2 className="text-[34px] font-bold tracking-tight text-[var(--color-foreground)]">发音设置</h2>
                  <p className="mt-2 max-w-[760px] text-[17px] leading-7 text-[var(--color-muted)]">
                    把试听、发音类型、朗读速度、音量和播放偏好收成一块，保持和上方两张主面板一致的玻璃质感。
                  </p>
                </div>
                <button
                  onClick={() => previewVoice()}
                  className="inline-flex h-[54px] items-center justify-center rounded-full bg-[var(--color-primary)] px-7 text-[20px] font-semibold text-white shadow-[0_16px_34px_rgba(255,132,0,0.24)] transition-transform active:scale-95"
                >
                  ▶ 试听
                </button>
              </div>

              <div className="mt-6 grid grid-cols-[320px_1fr_1fr] gap-4">
                <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  <p className="text-[14px] font-semibold uppercase tracking-[0.14em] text-[#8a8278]">试听说明</p>
                  <p className="mt-4 text-[16px] leading-7 text-[var(--color-foreground)]/85">
                    切换口音或语速后会自动试听，也可以手动再次播放。
                  </p>
                  <p className="mt-6 text-[14px] font-semibold uppercase tracking-[0.14em] text-[#8a8278]">当前状态</p>
                  <div className="mt-4 space-y-3 text-[18px] font-semibold text-[var(--color-foreground)]/82">
                    <p>口音：{ACCENT_LABELS[ttsSettings.accent]}</p>
                    <p>语速：{currentSpeedLabel}</p>
                    <p>音量：{Math.round(ttsSettings.volume * 100)}%</p>
                  </div>
                  <p className="mt-6 text-[15px] leading-7 text-[var(--color-muted)]">
                    使用 HTML5 SpeechSynthesis API，本地朗读，无需额外网络请求。
                  </p>
                </div>

                <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">发音类型</h3>
                  <div className="mt-4 space-y-4">
                    {accentOptions.map((accent) => {
                      const active = ttsSettings.accent === accent
                      return (
                        <button
                          key={accent}
                          type="button"
                          onClick={() => {
                            setAccent(accent)
                            setTimeout(() => previewVoice('Hello, welcome to Linswift.'), 100)
                          }}
                          className={`flex h-[64px] w-full items-center justify-between rounded-[16px] px-4 transition-colors ${
                            active
                              ? 'border-2 border-[var(--color-primary)] bg-[#fff3ea]'
                              : 'border border-white/85 bg-white/85'
                          }`}
                        >
                          <span className="text-[18px] font-semibold text-[var(--color-foreground)]">
                            {ACCENT_FLAGS[accent]} {ACCENT_LABELS[accent]}
                          </span>
                          <span className={`h-[22px] w-[22px] rounded-full border-[3px] ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[#cfc5bb]'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                  <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">朗读速度</h3>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {SPEED_OPTIONS.map((speed) => (
                      <button
                        key={speed.value}
                        type="button"
                        onClick={() => {
                          setRate(speed.value)
                          setTimeout(() => previewVoice('Hello, welcome to Linswift.'), 100)
                        }}
                        className={`inline-flex h-[46px] items-center justify-center rounded-full text-[18px] font-semibold transition-colors ${
                          ttsSettings.rate === speed.value
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'border border-white/85 bg-white/85 text-[var(--color-primary)]'
                        }`}
                      >
                        {speed.label}
                      </button>
                    ))}
                  </div>
                  <h3 className="mt-6 text-[20px] font-bold text-[var(--color-foreground)]">音量调节</h3>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-[18px] text-[#81786e]">🔉</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={ttsSettings.volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      className="h-[5px] flex-1 cursor-pointer accent-[var(--color-primary)]"
                    />
                    <span className="text-[18px] font-semibold text-[#7c6a5e]">{Math.round(ttsSettings.volume * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">播放偏好</h3>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <DesktopToggleTile label="自动播放发音" value={ttsSettings.autoPlay} onChange={() => toggleSetting('autoPlay')} />
                  <DesktopToggleTile label="单词发音" value={ttsSettings.wordPronounce} onChange={() => toggleSetting('wordPronounce')} />
                  <DesktopToggleTile label="例句发音" value={ttsSettings.sentencePronounce} onChange={() => toggleSetting('sentencePronounce')} />
                  <DesktopToggleTile label="循环播放" value={ttsSettings.loopPlay} onChange={() => toggleSetting('loopPlay')} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
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

function DesktopInfoCard({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string]>
}) {
  return (
    <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
      <h3 className="text-[16px] font-bold text-[#666666]">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 text-[16px] font-semibold">
            <span className="text-[#5d5751]">{label}</span>
            <span className="text-[var(--color-primary)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DesktopPlainCard({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-[20px] border border-white/75 bg-white/76 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
      <h3 className="text-[16px] font-bold text-[#666666]">{title}</h3>
      <p className="mt-4 text-[15px] leading-7 text-[var(--color-foreground)]/78">{body}</p>
    </div>
  )
}

function DesktopToggleTile({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex h-[56px] items-center justify-between rounded-[16px] border border-white/85 bg-white/85 px-4 transition-colors hover:bg-white"
    >
      <span className="text-[17px] font-medium text-[var(--color-foreground)]">{label}</span>
      <span className="text-[17px] font-bold text-[var(--color-primary)]">{value ? '开启' : '关闭'}</span>
    </button>
  )
}
