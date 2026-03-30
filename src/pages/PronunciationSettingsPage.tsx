/**
 * 发音设置页 —— 使用 HTML5 SpeechSynthesis API
 *
 * 功能：
 * 1. 口音选择（美式 🇺🇸 / 英式 🇬🇧 / 澳式 🇦🇺）
 * 2. 朗读速度调节（0.5x ~ 2.0x）
 * 3. 开关：自动播放发音、单词发音、例句发音、循环播放
 * 4. 音量滑块调节
 * 5. 一键试听当前设置效果
 *
 * 所有设置实时保存到 localStorage，全局生效
 */

import { ChevronLeft, Play } from 'lucide-react'
import { useTTSSettings } from '../hooks/useTTSSettings'
import {
  type AccentType,
  ACCENT_LABELS,
  ACCENT_FLAGS,
  SPEED_OPTIONS,
} from '../lib/tts'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'
import SettingsDesktopShell from '../components/settings/SettingsDesktopShell'

// 所有可选的口音
const accentOptions: AccentType[] = ['en-US', 'en-GB', 'en-AU']

export default function PronunciationSettingsPage() {
  const goBack = useLogicalBack('/learning-settings')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const {
    settings,
    preferredVoice,
    setAccent,
    setRate,
    setVolume,
    toggleSetting,
    previewVoice,
  } = useTTSSettings()

  const previewButton = (
    <button
      onClick={() => previewVoice()}
      className={`flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] text-white active:scale-95 transition-transform ${isDesktop ? 'px-5 py-3 shadow-[0_16px_34px_rgba(255,132,0,0.24)]' : 'ml-auto px-3 py-1.5'}`}
    >
      <Play size={14} className="fill-white" />
      <span className={`${isDesktop ? 'text-[14px]' : 'text-[13px]'} font-medium`}>试听</span>
    </button>
  )

  const accentCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>发音类型</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">选择你偏好的英语发音口音</p>
      <div className="space-y-2.5">
        {accentOptions.map(accent => {
          const isActive = settings.accent === accent
          return (
            <button
              key={accent}
              onClick={() => {
                setAccent(accent)
                setTimeout(() => previewVoice('Hello, how are you?'), 100)
              }}
              className={`w-full flex items-center justify-between rounded-[20px] border px-4 py-4 transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary-light)] border-[var(--color-primary)]'
                  : `${isDesktop ? 'glass-card-elevated' : 'bg-white'} border-[var(--color-border)]`
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-[20px]">{ACCENT_FLAGS[accent]}</span>
                <span className="text-[14px] font-medium text-[var(--color-foreground)]">{ACCENT_LABELS[accent]}</span>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                isActive ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border-dark)]'
              }`}>
                {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

  const speedCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>朗读速度</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">调节单词和例句的朗读语速</p>
      <div className="grid grid-cols-4 gap-2">
        {SPEED_OPTIONS.map(opt => {
          const isActive = settings.rate === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => {
                setRate(opt.value)
                setTimeout(() => previewVoice('Linswift'), 100)
              }}
              className={`rounded-full py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                  : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-primary-light)]'} text-[var(--color-primary)]`
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )

  const toggleCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] overflow-hidden' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden'}`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <ToggleRow label="🔊 自动播放发音" desc="翻页时自动朗读单词" value={settings.autoPlay} onChange={() => toggleSetting('autoPlay')} desktop={isDesktop} />
      <div className="h-px bg-[var(--color-border)] mx-4" />
      <ToggleRow label="💬 例句发音" desc="学习时朗读例句" value={settings.sentencePronounce} onChange={() => toggleSetting('sentencePronounce')} desktop={isDesktop} />
    </div>
  )

  const volumeCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>音量调节</h2>
      <div className="flex items-center gap-3">
        <span className="text-[16px]">🔈</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={e => setVolume(Number(e.target.value))}
          className="flex-1 h-1.5 accent-[var(--color-primary)] rounded-full appearance-none bg-[var(--color-border)] cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[var(--color-primary)]
            [&::-webkit-slider-thumb]:shadow-md"
        />
        <span className="text-[16px]">🔊</span>
        <span className="w-12 text-right text-[13px] text-[var(--color-muted)]">
          {Math.round(settings.volume * 100)}%
        </span>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <SettingsDesktopShell
        title="发音设置"
        description="把口音、语速、开关和音量拆成桌面控制台，试听按钮始终停在右上角。"
        onBack={goBack}
        sideTitle="Voice Preview"
        sideDescription="切换口音或语速后会自动试听，你也可以手动再次播放，快速比较不同朗读方案。"
        actions={previewButton}
        sideContent={
          <div className="space-y-6">
            <div className="glass-card-elevated rounded-[28px] p-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Current Voice</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">口音：{ACCENT_LABELS[settings.accent]}</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">
                  音源：{preferredVoice ? `${preferredVoice.name} · ${preferredVoice.lang}` : '等待系统语音加载'}
                </div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">语速：{SPEED_OPTIONS.find((item) => item.value === settings.rate)?.label}</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">音量：{Math.round(settings.volume * 100)}%</div>
              </div>
            </div>
            <div className="glass-card-elevated rounded-[28px] p-6 text-[14px] leading-6 text-[var(--color-foreground)]/78">
              使用 HTML5 SpeechSynthesis API，本地朗读，无需额外网络请求。
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="space-y-6">
            {accentCard}
            {toggleCard}
          </div>
          <div className="space-y-6">
            {speedCard}
            {volumeCard}
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
            发音设置
          </h1>

          {/* 试听按钮（右侧） */}
          {previewButton}
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ----- 口音选择 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">发音类型</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">选择你偏好的英语发音口音</p>

            <div className="space-y-2.5">
              {accentOptions.map(accent => {
                const isActive = settings.accent === accent
                return (
                  <button
                    key={accent}
                    onClick={() => {
                      setAccent(accent)
                      // 切换后自动试听
                      setTimeout(() => previewVoice('Hello, how are you?'), 100)
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-[var(--radius-sm)] border transition-colors ${
                      isActive
                        ? 'bg-[var(--color-primary-light)] border-[var(--color-primary)]'
                        : 'bg-white border-[var(--color-border)]'
                    }`}
                  >
                    {/* 左侧：国旗 + 标签 */}
                    <div className="flex items-center gap-3">
                      <span className="text-[20px]">{ACCENT_FLAGS[accent]}</span>
                      <span className={`text-[14px] font-medium ${isActive ? 'text-[var(--color-foreground)]' : 'text-[var(--color-foreground)]'}`}>
                        {ACCENT_LABELS[accent]}
                      </span>
                    </div>

                    {/* 右侧：选中标记（圆形 radio） */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isActive ? 'border-[var(--color-primary)] bg-[var(--color-primary)]' : 'border-[var(--color-border-dark)]'
                    }`}>
                      {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ----- 朗读速度 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">朗读速度</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">调节单词和例句的朗读语速</p>

            <div className="flex gap-2">
              {SPEED_OPTIONS.map(opt => {
                const isActive = settings.rate === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setRate(opt.value)
                      // 切换后自动试听
                      setTimeout(() => previewVoice('Linswift'), 100)
                    }}
                    className={`flex-1 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ----- 功能开关 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            <ToggleRow
              label="🔊 自动播放发音"
              desc="翻页时自动朗读单词"
              value={settings.autoPlay}
              onChange={() => toggleSetting('autoPlay')}
            />
            <div className="h-px bg-[var(--color-border)] mx-4" />
            <ToggleRow
              label="💬 例句发音"
              desc="学习时朗读例句"
              value={settings.sentencePronounce}
              onChange={() => toggleSetting('sentencePronounce')}
            />
          </div>

          {/* ----- 音量调节 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">音量调节</h2>
            <div className="flex items-center gap-3">
              <span className="text-[16px]">🔈</span>
              {/* HTML5 range 滑块 */}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                onChange={e => setVolume(Number(e.target.value))}
                className="flex-1 h-1.5 accent-[var(--color-primary)] rounded-full appearance-none bg-[var(--color-border)] cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-[var(--color-primary)]
                  [&::-webkit-slider-thumb]:shadow-md
                "
              />
              <span className="text-[16px]">🔊</span>
              <span className="text-[13px] text-[var(--color-muted)] w-8 text-right">
                {Math.round(settings.volume * 100)}%
              </span>
            </div>
          </div>

          {/* ----- 技术说明（小提示） ----- */}
          <div className="text-center py-2">
            <p className="text-[11px] text-[var(--color-muted-light)]">
              使用 HTML5 SpeechSynthesis API · 无需联网 · 零费用
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== Toggle 行组件（带描述文字） ==========
interface ToggleRowProps {
  label: string
  desc?: string
  value: boolean
  onChange: () => void
  desktop?: boolean
}

function ToggleRow({ label, desc, value, onChange, desktop = false }: ToggleRowProps) {
  return (
    <div className={`flex items-center justify-between ${desktop ? 'px-6 py-5' : 'px-5 py-3.5'}`}>
      <div>
        <span className={`${desktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>{label}</span>
        {desc && <p className="text-[11px] text-[var(--color-muted-light)] mt-0.5">{desc}</p>}
      </div>
      <button
        onClick={onChange}
        className={`w-[44px] h-[26px] rounded-full flex items-center transition-colors duration-200 ${
          value ? 'bg-[var(--color-primary)] justify-end' : 'bg-[var(--color-border-dark)] justify-start'
        }`}
      >
        <div className="w-[20px] h-[20px] rounded-full bg-white mx-[3px] shadow-sm" />
      </button>
    </div>
  )
}
