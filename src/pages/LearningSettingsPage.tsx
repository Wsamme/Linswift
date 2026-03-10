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
  ChevronLeft, ChevronRight, Volume2, BarChart3,
} from 'lucide-react'
import { useTTSSettings } from '../hooks/useTTSSettings'

// localStorage key
const LEARN_SETTINGS_KEY = 'linswift_learn_settings'

// 学习设置的类型
interface LearnSettings {
  dailyGoal: number           // 每日新学单词数
  learningMode: 'listen' | 'read' | 'write'  // 学习模式
  showExamples: boolean       // 显示例句
  reviewReminder: boolean     // 复习提醒
}

// 默认值
const DEFAULT_LEARN: LearnSettings = {
  dailyGoal: 20,
  learningMode: 'listen',
  showExamples: false,
  reviewReminder: true,
}

// 从 localStorage 读取
function loadLearnSettings(): LearnSettings {
  try {
    const raw = localStorage.getItem(LEARN_SETTINGS_KEY)
    return raw ? { ...DEFAULT_LEARN, ...JSON.parse(raw) } : { ...DEFAULT_LEARN }
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
  const { settings: ttsSettings, toggleSetting } = useTTSSettings()

  // ===== 学习设置状态 =====
  const [learn, setLearn] = useState<LearnSettings>(loadLearnSettings)

  // 每次修改后自动保存
  useEffect(() => {
    saveLearnSettings(learn)
  }, [learn])

  // 更新某个字段
  const update = (partial: Partial<LearnSettings>) => {
    setLearn(prev => ({ ...prev, ...partial }))
  }

  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] flex flex-col">
        {/* ===== 顶部导航 ===== */}
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-[var(--color-card)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">
            学习设置
          </h1>
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ----- 每日学习目标 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">每日学习目标</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">设置每天要学习的新单词数量</p>
            <div className="flex gap-2.5">
              {goalOptions.map(g => (
                <button
                  key={g}
                  onClick={() => update({ dailyGoal: g })}
                  className={`flex-1 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    learn.dailyGoal === g
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  }`}
                >
                  {g}个
                </button>
              ))}
            </div>
          </div>

          {/* ----- 学习模式 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">学习模式</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">选择你偏好的学习方式</p>
            <div className="flex gap-2.5">
              {modeOptions.map(m => (
                <button
                  key={m.key}
                  onClick={() => update({ learningMode: m.key })}
                  className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-[var(--radius-md)] transition-colors ${
                    learn.learningMode === m.key
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  }`}
                >
                  <span className="text-[20px]">{m.icon}</span>
                  <span className="text-[12px] font-medium">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ----- 功能开关列表 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* 发音设置（跳转到子页面） */}
            <button
              onClick={() => navigate('/pronunciation-settings')}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-[var(--color-background-secondary)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Volume2 size={18} className="text-[var(--color-muted)]" />
                <span className="text-[15px] text-[var(--color-foreground)]">发音设置</span>
              </div>
              <ChevronRight size={16} className="text-[var(--color-muted)]" />
            </button>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 自动播放单词 */}
            <ToggleRow
              label="🔄 自动播放单词"
              value={ttsSettings.autoPlay}
              onChange={() => toggleSetting('autoPlay')}
            />

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 显示例句 */}
            <ToggleRow
              label="📝 显示例句"
              value={learn.showExamples}
              onChange={() => update({ showExamples: !learn.showExamples })}
            />

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 复习提醒 */}
            <ToggleRow
              label="⏰ 复习提醒"
              value={learn.reviewReminder}
              onChange={() => update({ reviewReminder: !learn.reviewReminder })}
            />

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 学习统计（跳转） */}
            <button
              onClick={() => navigate('/learn')}
              className="w-full flex items-center justify-between px-5 py-3.5 active:bg-[var(--color-background-secondary)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <BarChart3 size={18} className="text-[var(--color-muted)]" />
                <span className="text-[15px] text-[var(--color-foreground)]">学习统计</span>
              </div>
              <ChevronRight size={16} className="text-[var(--color-muted)]" />
            </button>
          </div>
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
}

function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <span className="text-[15px] text-[var(--color-foreground)]">{label}</span>
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
