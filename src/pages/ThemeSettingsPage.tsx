/**
 * 主题设置页 —— 参照 pencil 设计稿 yMMDc
 *
 * 功能：
 * 1. 外观模式选择（浅色 / 深色 / 跟随系统）
 * 2. 字体大小调节（小 / 标准 / 大 / 超大）
 * 3. 界面语言（简体中文）
 * 4. 主题色选择
 *
 * 所有设置保存到 localStorage
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ===== localStorage key =====
const THEME_KEY = 'linswift_theme_settings'

// ===== 主题设置类型 =====
interface ThemeSettings {
  mode: 'light' | 'dark' | 'system'  // 外观模式
  fontSize: number                    // 字体大小：0=小 1=标准 2=大 3=超大
  language: string                    // 界面语言
  primaryColor: string                // 主题色
}

// ===== 默认值 =====
const DEFAULT_THEME: ThemeSettings = {
  mode: 'light',
  fontSize: 1,
  language: '简体中文',
  primaryColor: '#FF8400',
}

// ===== 读取 / 保存 =====
function loadThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    return raw ? { ...DEFAULT_THEME, ...JSON.parse(raw) } : { ...DEFAULT_THEME }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

function saveThemeSettings(s: ThemeSettings) {
  localStorage.setItem(THEME_KEY, JSON.stringify(s))
}

// ===== 外观模式选项 =====
const modeOptions: { key: ThemeSettings['mode']; icon: string; label: string }[] = [
  { key: 'light', icon: '☀️', label: '浅色' },
  { key: 'dark', icon: '🌙', label: '深色' },
  { key: 'system', icon: '📱', label: '跟随系统' },
]

// ===== 字体大小选项 =====
const fontSizeOptions = [
  { label: '小', value: 0, previewSize: 13 },
  { label: '标准', value: 1, previewSize: 15 },
  { label: '大', value: 2, previewSize: 17 },
  { label: '超大', value: 3, previewSize: 20 },
]

// ===== 主题色选项 =====
const colorOptions = [
  { color: '#FF8400', label: '活力橙' },
  { color: '#3B82F6', label: '蔚蓝' },
  { color: '#8B5CF6', label: '梦幻紫' },
  { color: '#22C55E', label: '清新绿' },
  { color: '#EF4444', label: '热情红' },
  { color: '#EC4899', label: '甜蜜粉' },
]

export default function ThemeSettingsPage() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeSettings>(loadThemeSettings)

  // 自动保存
  useEffect(() => { saveThemeSettings(theme) }, [theme])

  const update = (partial: Partial<ThemeSettings>) => {
    setTheme(prev => ({ ...prev, ...partial }))
  }

  // 当前字体大小的预览文字大小
  const currentPreviewSize = fontSizeOptions.find(f => f.value === theme.fontSize)?.previewSize || 15

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
            主题设置
          </h1>
        </div>

        {/* ===== 可滚动内容区 ===== */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">

          {/* ----- 外观模式 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">外观模式</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">选择你喜欢的界面外观</p>
            <div className="flex gap-2.5">
              {modeOptions.map(m => (
                <button
                  key={m.key}
                  onClick={() => update({ mode: m.key })}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-[var(--radius-md)] transition-all ${
                    theme.mode === m.key
                      ? 'bg-[var(--color-card)] ring-[1.5px] ring-[var(--color-primary)] shadow-sm'
                      : 'bg-[var(--color-card)] ring-1 ring-[var(--color-border)]'
                  }`}
                >
                  <span className="text-[24px]">{m.icon}</span>
                  <span className={`text-[12px] font-medium ${
                    theme.mode === m.key ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-muted)]'
                  }`}>
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ----- 字体大小 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">字体大小</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">调整应用内的文字显示大小</p>

            {/* 字体大小滑块 */}
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-muted)]">A</span>
              <div className="flex-1 relative h-6 flex items-center">
                {/* 轨道 */}
                <div className="absolute inset-x-0 h-1.5 bg-[var(--color-background-secondary)] rounded-full">
                  {/* 填充部分 */}
                  <div
                    className="h-full bg-[var(--color-primary)] rounded-full transition-all"
                    style={{ width: `${(theme.fontSize / 3) * 100}%` }}
                  />
                </div>
                {/* 滑块选项 */}
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={theme.fontSize}
                  onChange={(e) => update({ fontSize: parseInt(e.target.value) })}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
                {/* 可视化刻度点 */}
                <div className="absolute inset-x-0 flex justify-between pointer-events-none">
                  {fontSizeOptions.map(f => (
                    <div
                      key={f.value}
                      className={`w-3 h-3 rounded-full transition-all ${
                        f.value <= theme.fontSize
                          ? 'bg-[var(--color-primary)] scale-100'
                          : 'bg-[var(--color-border-dark)] scale-75'
                      } ${f.value === theme.fontSize ? 'ring-2 ring-[var(--color-primary)]/30 scale-125' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <span className="text-[20px] font-bold text-[var(--color-muted)]">A</span>
            </div>

            {/* 大小标签 */}
            <div className="flex justify-between px-0.5">
              {fontSizeOptions.map(f => (
                <button
                  key={f.value}
                  onClick={() => update({ fontSize: f.value })}
                  className={`text-[11px] ${
                    theme.fontSize === f.value ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-muted)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 预览文字 */}
            <div className="pt-2 border-t border-[var(--color-border)]">
              <p
                className="text-[var(--color-foreground)] leading-relaxed transition-all"
                style={{ fontSize: `${currentPreviewSize}px` }}
              >
                这是预览文字 This is preview text
              </p>
            </div>
          </div>

          {/* ----- 语言 & 主题色 ----- */}
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
            {/* 界面语言 */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[18px]">🌐</span>
                <span className="text-[15px] text-[var(--color-foreground)]">界面语言</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] text-[var(--color-primary)]">{theme.language}</span>
                <ChevronRight size={16} className="text-[var(--color-muted)]" />
              </div>
            </div>

            <div className="h-px bg-[var(--color-border)] mx-4" />

            {/* 主题色 */}
            <div className="px-5 py-3.5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[18px]">🎨</span>
                  <span className="text-[15px] text-[var(--color-foreground)]">主题色</span>
                </div>
                <div
                  className="w-6 h-6 rounded-full ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: theme.primaryColor }}
                />
              </div>
              {/* 颜色选择器 */}
              <div className="flex gap-3 justify-center">
                {colorOptions.map(c => (
                  <button
                    key={c.color}
                    onClick={() => update({ primaryColor: c.color })}
                    className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${
                      theme.primaryColor === c.color ? 'ring-2 ring-offset-2 ring-[var(--color-foreground)] scale-110' : ''
                    }`}
                    style={{ backgroundColor: c.color }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
