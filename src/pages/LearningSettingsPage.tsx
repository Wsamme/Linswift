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
import { t, tf, useAppLanguage, getLanguageLabel } from '../lib/i18n'
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  loadLearnSettings,
  normalizeDailyGoal,
  saveLearnSettings,
  type LearnSettings,
} from '../lib/learnSettings'

// 每日目标选项
const goalOptions = [10, 20, 30, 50]

// 学习模式选项 - labels are resolved at render time via i18n
const modeKeys = [
  { key: 'listen' as const, icon: '👂', labelKey: 'lsettings_mode_listen' as const },
  { key: 'read' as const, icon: '📖', labelKey: 'lsettings_mode_read' as const },
  { key: 'write' as const, icon: '✍️', labelKey: 'lsettings_mode_spell' as const },
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
  const lang = useAppLanguage()
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
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const modeOptions = modeKeys.map(m => ({ ...m, label: t(lang, m.labelKey) }))

  // ===== 学习设置状态 =====
  const [learn, setLearn] = useState<LearnSettings>(loadLearnSettings)
  const [goalDraft, setGoalDraft] = useState(() => String(loadLearnSettings().dailyGoal))
  const [remoteLoading, setRemoteLoading] = useState(true)
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // 每次修改后自动保存
  useEffect(() => {
    saveLearnSettings(learn)
  }, [learn])

  useEffect(() => {
    setGoalDraft(String(learn.dailyGoal))
  }, [learn.dailyGoal])

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

  const applyDailyGoal = (value: string | number) => {
    const nextGoal = normalizeDailyGoal(value)
    setGoalDraft(String(nextGoal))
    update({ dailyGoal: nextGoal })
  }

  const adjustDailyGoal = (delta: number) => {
    applyDailyGoal(learn.dailyGoal + delta)
  }

  const syncIndicator = (
    <div className={`text-[12px] ${isDesktop ? 'glass-card-elevated rounded-full px-4 py-2' : ''} text-[var(--color-muted)]`}>
      {remoteLoading && <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />{t(lang,'common_loading')}</span>}
      {!remoteLoading && syncState === 'saving' && <span>{t(lang,'common_syncing')}</span>}
      {!remoteLoading && syncState === 'saved' && <span className="text-[var(--color-success)]">{t(lang,'common_synced')}</span>}
      {!remoteLoading && syncState === 'error' && <span className="text-[var(--color-error)]">{t(lang,'common_sync_fail')}</span>}
    </div>
  )

  const activeModeLabel = modeOptions.find((item) => item.key === learn.learningMode)?.label || t(lang,'lsettings_mode_listen')
  const currentModeLabel = themeSettings.mode === 'system'
    ? t(lang,'theme_system')
    : themeSettings.mode === 'dark'
      ? t(lang,'theme_dark')
      : t(lang,'theme_light')
  const currentThemeColorLabel = themeColorOptions.find(
    (item) => item.color === themeSettings.primaryColor
  )?.label || '活力橙'
  const currentSpeedLabel = SPEED_OPTIONS.find((item) => item.value === ttsSettings.rate)?.label || '1.0x'
  const currentFontSize = themeSettings.fontSize
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const isDarkResolved = themeSettings.mode === 'dark' || (themeSettings.mode === 'system' && prefersDark)
  const glassPanel = 'glass-card-strong'
  const glassSoft = 'glass-card-soft'
  const glassElevated = 'glass-card-elevated'
  const desktopInsetPanelClass = `${glassElevated} rounded-[12px]`
  const desktopNeutralButtonClass = `${glassSoft} text-[var(--color-foreground)]`
  const desktopAccentSelectionClass = isDarkResolved
    ? 'border-2 border-[var(--color-primary)] bg-[rgba(255,132,0,0.14)] text-[var(--color-primary)]'
    : 'border-2 border-[var(--color-primary)] bg-[#fff4e8] text-[var(--color-primary)]'
  const desktopAccentSelectionSoftClass = isDarkResolved
    ? 'border-2 border-[var(--color-primary)] bg-[rgba(255,132,0,0.12)]'
    : 'border-2 border-[var(--color-primary)] bg-[#fff3ea]'

  const planCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className="space-y-1">
        <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>{t(lang,'lsettings_plan')}</h2>
        <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang,'lsettings_plan_detail_desc')}</p>
      </div>

      <div className="space-y-3 rounded-[22px] bg-white/35 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[var(--color-foreground)]">{t(lang,'lsettings_daily_goal')}</span>
          <span className="text-[12px] text-[var(--color-primary)]">{tf(lang,'lsettings_count_unit',{n:learn.dailyGoal})}</span>
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
              {tf(lang,'lsettings_count_unit',{n:g})}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[64px_minmax(0,1fr)_64px] gap-2.5">
          <button
            type="button"
            onClick={() => adjustDailyGoal(-5)}
            className={`${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} rounded-full py-2 text-[13px] font-medium text-[var(--color-primary)] transition-colors`}
          >
            -5
          </button>
          <input
            type="number"
            min={DAILY_GOAL_MIN}
            max={DAILY_GOAL_MAX}
            step={1}
            inputMode="numeric"
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
            onBlur={() => applyDailyGoal(goalDraft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            className={`${isDesktop ? 'glass-card-elevated' : 'bg-white/80'} rounded-full px-4 py-2 text-center text-[14px] font-semibold text-[var(--color-foreground)] outline-none ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            placeholder={t(lang,'lsettings_custom')}
          />
          <button
            type="button"
            onClick={() => adjustDailyGoal(5)}
            className={`${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} rounded-full py-2 text-[13px] font-medium text-[var(--color-primary)] transition-colors`}
          >
            +5
          </button>
        </div>
        <p className="text-[11px] text-[var(--color-muted)]">{tf(lang,'lsettings_plan_range_desc',{min:DAILY_GOAL_MIN,max:DAILY_GOAL_MAX})}</p>
      </div>

      <div className="space-y-3 rounded-[22px] bg-white/35 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-[var(--color-foreground)]">{t(lang,'lsettings_review_cycle')}</span>
          <span className="text-[12px] text-[var(--color-primary)]">{tf(lang,'lsettings_day_cycle',{days:learn.reviewCycleDays})}</span>
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
              {tf(lang,'lsettings_day_cycle',{days:day})}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const modeCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>{t(lang,'lsettings_mode')}</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang,'lsettings_mode_desc')}</p>
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
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>{t(lang,'lsettings_theme_title')}</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang,'lsettings_theme_desc')}</p>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { key: 'light' as const, label: t(lang,'theme_light'), icon: '☀️' },
          { key: 'dark' as const, label: t(lang,'theme_dark'), icon: '🌙' },
          { key: 'system' as const, label: t(lang,'theme_system'), icon: '📱' },
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
          {themeSettings.mode === 'system' ? t(lang,'theme_system') : themeSettings.mode === 'dark' ? t(lang,'lsettings_dark_mode') : t(lang,'lsettings_light_mode')}
          </p>
          <p className="mt-1">{t(lang,'lsettings_language_prefix')}{getLanguageLabel(themeSettings.language)}</p>
        </div>
        <button
          onClick={() => navigate('/theme-settings')}
          className="rounded-full bg-[var(--color-primary-light)] px-4 py-2 text-[12px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
        >
          {t(lang,'lsettings_more_theme')}
        </button>
      </div>
    </div>
  )

  const featureCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] overflow-hidden' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden'}`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className={`${isDesktop ? 'px-6 pt-6 pb-4' : 'px-5 pt-5 pb-4'}`}>
        <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>{t(lang,'lsettings_reading')}</h2>
        <p className="mt-1 text-[12px] text-[var(--color-muted-light)]">{t(lang,'lsettings_reading_desc')}</p>
      </div>

      <button
        onClick={() => navigate('/pronunciation-settings')}
        className={`w-full flex items-center justify-between ${isDesktop ? 'px-6 py-5 hover:bg-white/40' : 'px-5 py-3.5 active:bg-[var(--color-background-secondary)]'} transition-colors`}
      >
        <div className="flex items-center gap-3">
          <Volume2 size={18} className="text-[var(--color-muted)]" />
          <span className={`${isDesktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>{t(lang,'lsettings_pronunciation')}</span>
        </div>
        <ChevronRight size={16} className="text-[var(--color-muted)]" />
      </button>

      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label={`🔄 ${t(lang,'lsettings_auto_play')}`} value={ttsSettings.autoPlay} onChange={() => toggleSetting('autoPlay')} desktop={isDesktop} />
      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label={`📝 ${t(lang,'lsettings_show_example')}`} value={learn.showExamples} onChange={() => update({ showExamples: !learn.showExamples })} desktop={isDesktop} />
      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label={`⏰ ${t(lang,'lsettings_review_reminder')}`} value={learn.reviewReminder} onChange={() => update({ reviewReminder: !learn.reviewReminder })} desktop={isDesktop} />
    </div>
  )

  if (isDesktop) {
    return (
      <div className="glass-page h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-5">
          <div className={`${glassPanel} relative overflow-hidden rounded-[32px] p-6`}>
            <div className="mb-5 flex items-start gap-3">
              <button
                onClick={goBack}
                className={`${glassElevated} inline-flex h-[48px] w-[48px] items-center justify-center rounded-full text-[var(--color-foreground)]`}
              >
                <ChevronLeft size={22} />
              </button>
              <div className="pt-1">
                <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">PERSONAL SETTINGS</p>
                <h1 className="mt-1 text-[36px] font-bold tracking-tight text-[var(--color-foreground)] font-secondary">{t(lang,'lsettings_title')}</h1>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <section
                className={`${glassElevated} flex h-full flex-col rounded-[28px] p-5`}
              >
                <h2 className="text-[24px] font-bold tracking-tight text-[var(--color-foreground)]">{t(lang,'lsettings_title')}</h2>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <DesktopInfoCard
                    title={t(lang,'lsettings_sync_status')}
                    rows={[
                      [t(lang,'lsettings_syncable'), tf(lang,'common_items',{n:3})],
                      [t(lang,'lsettings_local_only'), tf(lang,'common_items',{n:2})],
                      [t(lang,'lsettings_last_sync'), remoteLoading ? t(lang,'common_loading') : syncState === 'error' ? t(lang,'common_fail') : t(lang,'common_today')],
                    ]}
                  />
                  <DesktopInfoCard
                    title={t(lang,'lsettings_current')}
                    rows={[
                      [t(lang,'lsettings_daily_target'), tf(lang,'lsettings_count_unit',{n:learn.dailyGoal})],
                      [t(lang,'lsettings_review_cycle'), tf(lang,'lsettings_day_cycle',{days:learn.reviewCycleDays})],
                      [t(lang,'lsettings_mode'), activeModeLabel],
                    ]}
                  />
                </div>

                <div
                  className={`${glassSoft} mt-4 rounded-[24px] p-4`}
                >
                  <h3 className="text-[20px] font-bold text-[var(--color-foreground)]">{t(lang,'lsettings_plan')}</h3>

                  <div className="mt-4">
                    <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{t(lang,'lsettings_daily_new_goal')}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {goalOptions.map((g) => (
                        <button
                          key={g}
                          onClick={() => update({ dailyGoal: g })}
                          className={`inline-flex h-[42px] min-w-[88px] items-center justify-center rounded-[12px] px-4 text-[16px] font-semibold transition-colors ${
                            learn.dailyGoal === g
                              ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_20px_rgba(255,132,0,0.2)]'
                              : `${glassElevated} text-[var(--color-primary)]`
                          }`}
                        >
                          {tf(lang,'lsettings_count_unit',{n:g})}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-[84px_minmax(0,1fr)_84px] gap-3">
                      <button
                        type="button"
                        onClick={() => adjustDailyGoal(-5)}
                        className={`${glassElevated} inline-flex h-[42px] items-center justify-center rounded-[12px] text-[15px] font-semibold text-[var(--color-primary)] transition-colors`}
                      >
                        -5
                      </button>
                      <input
                        type="number"
                        min={DAILY_GOAL_MIN}
                        max={DAILY_GOAL_MAX}
                        step={1}
                        inputMode="numeric"
                        value={goalDraft}
                        onChange={(event) => setGoalDraft(event.target.value)}
                        onBlur={() => applyDailyGoal(goalDraft)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                          }
                        }}
                        className={`${glassElevated} h-[42px] rounded-[12px] px-4 text-center text-[16px] font-semibold text-[var(--color-foreground)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                        placeholder={t(lang,'lsettings_custom')}
                      />
                      <button
                        type="button"
                        onClick={() => adjustDailyGoal(5)}
                        className={`${glassElevated} inline-flex h-[42px] items-center justify-center rounded-[12px] text-[15px] font-semibold text-[var(--color-primary)] transition-colors`}
                      >
                        +5
                      </button>
                    </div>
                    <p className="mt-2 text-[12px] leading-5 text-[var(--color-muted)]">
                      {t(lang,'lsettings_goal_hint')}
                    </p>
                  </div>

                  <div className="mt-5">
                    <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{t(lang,'lsettings_review_cycle')}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {[7, 15].map((day) => (
                        <button
                          key={day}
                          onClick={() => update({ reviewCycleDays: day as 7 | 15 })}
                          className={`inline-flex h-[46px] min-w-[136px] items-center justify-center rounded-[14px] px-5 text-[16px] font-semibold transition-colors ${
                            learn.reviewCycleDays === day
                              ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_20px_rgba(255,132,0,0.2)]'
                              : `${glassElevated} text-[var(--color-primary)]`
                          }`}
                        >
                          {tf(lang,'lsettings_day_cycle',{days:day})}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section
                className={`${glassElevated} h-full rounded-[28px] p-5`}
              >
                <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-foreground)]">{t(lang,'lsettings_theme_title')}</h2>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-3">
                    <DesktopPlainCard
                      title={t(lang,'lsettings_theme_summary')}
                      body={t(lang,'lsettings_theme_summary_desc')}
                    />
                    <DesktopInfoCard
                      title={t(lang,'lsettings_current_status')}
                      rows={[
                        [t(lang,'lsettings_appearance'), currentModeLabel],
                        [t(lang,'theme_language'), getLanguageLabel(themeSettings.language)],
                        [t(lang,'theme_color'), currentThemeColorLabel],
                      ]}
                    />
                    <div className={`${desktopInsetPanelClass} p-3`}>
                      <h3 className="text-[18px] font-bold leading-none text-[var(--color-foreground)]">{t(lang,'theme_language')}</h3>
                      <div className="mt-3 flex flex-col items-center gap-2">
                        {languageOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => updateThemeSettings({ language: option.value })}
                            className={`inline-flex h-[34px] w-[120px] items-center justify-center rounded-full px-3 text-[12px] font-semibold transition-colors ${
                              themeSettings.language === option.value
                                ? 'bg-[var(--color-primary)] text-white'
                                : desktopNeutralButtonClass
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[1.1fr_1fr] gap-3">
                    <div className={`${desktopInsetPanelClass} p-3`}>
                      <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">{t(lang,'lsettings_appearance')}</h3>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          { key: 'light' as const, label: t(lang,'theme_light'), icon: '☀' },
                          { key: 'dark' as const, label: t(lang,'theme_dark'), icon: '☾' },
                          { key: 'system' as const, label: t(lang,'theme_system'), icon: '▣' },
                        ].map((mode) => (
                          <button
                            key={mode.key}
                            onClick={() => updateThemeSettings({ mode: mode.key })}
                            className={`flex h-[78px] flex-col items-center justify-center gap-1 rounded-[12px] px-2 transition-colors ${
                              themeSettings.mode === mode.key
                                ? desktopAccentSelectionClass
                                : desktopNeutralButtonClass
                            }`}
                          >
                            <span className="text-[16px] font-semibold">{mode.icon}</span>
                            <span className={`text-center ${mode.key === 'system' ? 'text-[11px]' : 'text-[12px]'} font-semibold`}>
                              {mode.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={`${desktopInsetPanelClass} p-3`}>
                      <h3 className="text-[18px] font-bold leading-none text-[var(--color-foreground)]">{t(lang,'theme_font_size')}</h3>
                      <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">{t(lang,'theme_font_desc')}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <span className={`text-[14px] font-bold ${isDarkResolved ? 'text-[#b8bec8]' : 'text-[#786f66]'}`}>A</span>
                        <div className="relative flex-1">
                          <div className={`h-[6px] rounded-full ${isDarkResolved ? 'bg-[#2d323a]' : 'bg-[#b8aca0]'}`} />
                          <div
                            className={`absolute left-0 top-0 h-[6px] rounded-full ${isDarkResolved ? 'bg-[var(--color-primary)]' : 'bg-[#7c6a5e]'}`}
                            style={{ width: `${(currentFontSize / 2) * 100}%` }}
                          />
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
                            className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-md ${
                              isDarkResolved
                                ? 'border-2 border-white/10 bg-[#101217]'
                                : 'border-4 border-white bg-[#7c6a5e]'
                            }`}
                            style={{ left: `calc(${(currentFontSize / 2) * 100}% - 10px)` }}
                          />
                        </div>
                        <span className={`text-[22px] font-bold ${isDarkResolved ? 'text-[#b8bec8]' : 'text-[#786f66]'}`}>A</span>
                      </div>
                      <div className="mt-2 flex justify-between text-[13px] font-bold text-[var(--color-primary)]">
                        <button type="button" onClick={() => updateThemeSettings({ fontSize: 0 })}>{t(lang,'theme_font_small')}</button>
                        <button type="button" onClick={() => updateThemeSettings({ fontSize: 1 })}>{t(lang,'theme_font_standard')}</button>
                        <button type="button" onClick={() => updateThemeSettings({ fontSize: 2 })}>{t(lang,'theme_font_large')}</button>
                      </div>
                      <p className="mt-3 text-[15px] text-[var(--color-foreground)]" style={{ fontSize: `${[13, 15, 17][currentFontSize]}px` }}>
                        {t(lang,'theme_font_preview')}
                      </p>
                    </div>
                  </div>

                  <div className={`${desktopInsetPanelClass} p-3`}>
                    <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">{t(lang,'theme_color')}</h3>
                    <div className="mt-3 flex items-center justify-between">
                      {themeColorOptions.map((color) => (
                        <button
                          key={color.color}
                          type="button"
                          onClick={() => updateThemeSettings({ primaryColor: color.color })}
                          className={`h-[24px] w-[24px] rounded-full transition-transform ${themeSettings.primaryColor === color.color ? 'scale-110 ring-2 ring-[#2c241f]/18' : ''}`}
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

            <section
              className={`${glassElevated} mt-4 rounded-[28px] p-4`}
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h2 className="text-[22px] font-bold tracking-tight text-[var(--color-foreground)]">{t(lang,'pron_title')}</h2>
                </div>
                <button
                  onClick={() => previewVoice()}
                  className="inline-flex h-[40px] items-center justify-center rounded-full bg-[var(--color-primary)] px-5 text-[14px] font-semibold text-white shadow-[0_10px_20px_rgba(255,132,0,0.24)] transition-transform active:scale-95"
                >
                  ▶ {t(lang,'pron_listen')}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-[228px_1fr_1fr] gap-3">
                <div className={`${desktopInsetPanelClass} p-4`}>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{t(lang,'lsettings_current_status')}</p>
                  <div className="mt-3 space-y-2 text-[13px] font-semibold text-[var(--color-foreground)]/82">
                    <p>{t(lang,'pron_accent_label')}{ACCENT_LABELS[ttsSettings.accent]}</p>
                    <p>{t(lang,'pron_speed_label')}{currentSpeedLabel}</p>
                    <p>{t(lang,'pron_volume_label')}{Math.round(ttsSettings.volume * 100)}%</p>
                  </div>
                  <p className="mt-4 text-[12px] leading-6 text-[var(--color-muted)]">
                    {t(lang,'pron_html5_note')}
                  </p>
                </div>

                <div className={`${desktopInsetPanelClass} p-4`}>
                  <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">{t(lang,'pron_accent')}</h3>
                  <div className="mt-3 space-y-3">
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
                          className={`flex h-[48px] w-full items-center justify-between rounded-[12px] px-3 transition-colors ${
                            active
                              ? desktopAccentSelectionSoftClass
                              : desktopNeutralButtonClass
                          }`}
                        >
                          <span className="text-[14px] font-semibold text-[var(--color-foreground)]">
                            {ACCENT_FLAGS[accent]} {ACCENT_LABELS[accent]}
                          </span>
                          <span className={`h-[22px] w-[22px] rounded-full border-[3px] ${active ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : isDarkResolved ? 'border-[#4a505a]' : 'border-[#cfc5bb]'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className={`${desktopInsetPanelClass} p-4`}>
                  <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">{t(lang,'pron_speed')}</h3>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {SPEED_OPTIONS.map((speed) => (
                      <button
                        key={speed.value}
                        type="button"
                        onClick={() => {
                          setRate(speed.value)
                          setTimeout(() => previewVoice('Hello, welcome to Linswift.'), 100)
                        }}
                        className={`inline-flex h-[34px] items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
                          ttsSettings.rate === speed.value
                            ? 'bg-[var(--color-primary)] text-white'
                            : desktopNeutralButtonClass
                        }`}
                      >
                        {speed.label}
                      </button>
                    ))}
                  </div>
                  <h3 className="mt-4 text-[18px] font-bold text-[var(--color-foreground)]">{t(lang,'pron_volume')}</h3>
                  <div className="mt-3 flex items-center gap-3">
                    <span className={`text-[18px] ${isDarkResolved ? 'text-[#b8bec8]' : 'text-[#81786e]'}`}>🔉</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={ttsSettings.volume}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      className="h-[5px] flex-1 cursor-pointer accent-[var(--color-primary)]"
                    />
                    <span className={`text-[18px] font-semibold ${isDarkResolved ? 'text-[#d1a372]' : 'text-[#7c6a5e]'}`}>{Math.round(ttsSettings.volume * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className={`${desktopInsetPanelClass} mt-4 p-4`}>
                <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">{t(lang,'lsettings_play_pref')}</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <DesktopToggleTile label={t(lang,'pron_auto_play')} value={ttsSettings.autoPlay} onChange={() => toggleSetting('autoPlay')} onLabel={t(lang,'common_on')} offLabel={t(lang,'common_off')} />
                  <DesktopToggleTile label={t(lang,'pron_sentence')} value={ttsSettings.sentencePronounce} onChange={() => toggleSetting('sentencePronounce')} onLabel={t(lang,'common_on')} offLabel={t(lang,'common_off')} />
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
            {t(lang,'lsettings_title')}
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
    <div className="flex min-h-[164px] flex-col rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-panel-elevated-bg)] p-4 shadow-[var(--glass-shadow-soft)]">
      <h3 className="text-[13px] font-bold text-[var(--color-muted)]">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-[12px] font-semibold">
            <span className="text-[var(--color-foreground)]/85">{label}</span>
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
    <div className="rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-panel-elevated-bg)] p-3 shadow-[var(--glass-shadow-soft)]">
      <h3 className="text-[13px] font-bold text-[var(--color-muted)]">{title}</h3>
      <p className="mt-2 text-[12px] leading-5 text-[var(--color-foreground)]/78">{body}</p>
    </div>
  )
}

function DesktopToggleTile({
  label,
  value,
  onChange,
  onLabel = 'On',
  offLabel = 'Off',
}: {
  label: string
  value: boolean
  onChange: () => void
  onLabel?: string
  offLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex h-[42px] items-center justify-between rounded-[12px] border border-[var(--glass-border)] bg-[var(--glass-panel-elevated-bg)] px-3 transition-colors hover:brightness-105"
    >
      <span className="text-[13px] font-medium text-[var(--color-foreground)]">{label}</span>
      <span className="text-[13px] font-bold text-[var(--color-primary)]">{value ? onLabel : offLabel}</span>
    </button>
  )
}
