/**
 * 主题设置页
 *
 * 功能：
 * 1. 外观模式选择（浅色 / 深色 / 跟随浏览器）
 * 2. 字体大小调节（小 / 标准 / 大）
 * 3. 界面语言（简体中文 / English / 日本語）
 * 4. 主题色选择
 *
 * 所有设置实时应用到全局，并将主题模式同步到 Supabase user_settings
 */

import { ChevronLeft } from 'lucide-react'
import { useThemeSettings } from '../hooks/useThemeSettings'
import type { ThemeSettings } from '../lib/theme'
import { t, useAppLanguage } from '../lib/i18n'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { useMediaQuery } from '../hooks/useMediaQuery'
import SettingsDesktopShell from '../components/settings/SettingsDesktopShell'

type I18nKey = Parameters<typeof t>[1]

const modeOptions: { key: ThemeSettings['mode']; icon: string; labelKey: I18nKey }[] = [
  { key: 'light', icon: '☀️', labelKey: 'theme_light' },
  { key: 'dark', icon: '🌙', labelKey: 'theme_dark' },
  { key: 'system', icon: '📱', labelKey: 'theme_system' },
]

const fontSizeOptions: Array<{ labelKey: I18nKey; value: number; previewSize: number }> = [
  { labelKey: 'theme_font_small', value: 0, previewSize: 13 },
  { labelKey: 'theme_font_standard', value: 1, previewSize: 16 },
  { labelKey: 'theme_font_large', value: 2, previewSize: 18 },
]

const languageOptionKeys: Array<{ value: ThemeSettings['language']; labelKey: 'lang_zh_CN' | 'lang_en' | 'lang_ja' }> = [
  { value: 'zh-CN', labelKey: 'lang_zh_CN' },
  { value: 'en', labelKey: 'lang_en' },
  { value: 'ja', labelKey: 'lang_ja' },
]

const colorOptions: Array<{ color: string; labelKey: I18nKey }> = [
  { color: '#FF8400', labelKey: 'color_orange' },
  { color: '#3B82F6', labelKey: 'color_blue' },
  { color: '#8B5CF6', labelKey: 'color_purple' },
  { color: '#22C55E', labelKey: 'color_green' },
  { color: '#EF4444', labelKey: 'color_red' },
  { color: '#EC4899', labelKey: 'color_pink' },
]

export default function ThemeSettingsPage() {
  const goBack = useLogicalBack('/app/profile')
  const lang = useAppLanguage()
  const { settings, updateSettings } = useThemeSettings()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const update = (partial: Partial<ThemeSettings>) => {
    updateSettings(partial)
  }

  const currentPreviewSize = fontSizeOptions.find((f) => f.value === settings.fontSize)?.previewSize || 16

  const appearanceCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>{t(lang, 'theme_appearance')}</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang, 'theme_appearance_desc')}</p>
      <div className="grid grid-cols-3 gap-3">
        {modeOptions.map((m) => (
          <button
            key={m.key}
            onClick={() => update({ mode: m.key })}
            className={`flex flex-col items-center gap-2 rounded-[20px] py-4 transition-all ${
              settings.mode === m.key
                ? 'bg-[var(--color-card)] ring-[1.5px] ring-[var(--color-primary)] shadow-sm'
                : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-card)]'} ring-1 ring-[var(--color-border)]`
            }`}
          >
            <span className="text-[24px]">{m.icon}</span>
            <span className={`text-[12px] font-medium ${settings.mode === m.key ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-muted)]'}`}>
              {t(lang, m.labelKey)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  const fontCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <h2 className={`${isDesktop ? 'text-[20px]' : 'text-[16px]'} font-semibold text-[var(--color-foreground)]`}>{t(lang, 'theme_font_size')}</h2>
      <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang, 'theme_font_desc')}</p>
      <div className="flex items-center gap-3">
        <span className="text-[12px] text-[var(--color-muted)]">A</span>
        <div className="relative flex h-6 flex-1 items-center">
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-[var(--color-background-secondary)]">
            <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${(settings.fontSize / 2) * 100}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: parseInt(e.target.value, 10) })}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
          <div className="pointer-events-none absolute inset-x-0 flex justify-between">
            {fontSizeOptions.map((f) => (
              <div
                key={f.value}
                className={`h-3 w-3 rounded-full transition-all ${
                  f.value <= settings.fontSize ? 'bg-[var(--color-primary)] scale-100' : 'bg-[var(--color-border-dark)] scale-75'
                } ${f.value === settings.fontSize ? 'ring-2 ring-[var(--color-primary)]/30 scale-125' : ''}`}
              />
            ))}
          </div>
        </div>
        <span className="text-[20px] font-bold text-[var(--color-muted)]">A</span>
      </div>
      <div className="flex justify-between px-0.5">
        {fontSizeOptions.map((f) => (
          <button
            key={f.value}
            onClick={() => update({ fontSize: f.value })}
            className={`text-[11px] ${settings.fontSize === f.value ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-muted)]'}`}
          >
            {t(lang, f.labelKey)}
          </button>
        ))}
      </div>
      <div className="border-t border-[var(--color-border)] pt-2">
        <p className="leading-relaxed text-[var(--color-foreground)] transition-all" style={{ fontSize: `${currentPreviewSize}px` }}>
          {t(lang, 'theme_preview')}
        </p>
      </div>
    </div>
  )

  const languageCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[18px]">🌐</span>
          <span className={`${isDesktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>{t(lang, 'theme_language')}</span>
        </div>
        <span className="text-[13px] text-[var(--color-primary)]">{t(lang, settings.language === 'zh-CN' ? 'lang_zh_CN' : settings.language === 'ja' ? 'lang_ja' : 'lang_en')}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {languageOptionKeys.map((langOption) => (
          <button
            key={langOption.value}
            onClick={() => update({ language: langOption.value })}
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              settings.language === langOption.value
                ? 'bg-[var(--color-primary)] text-white'
                : `${isDesktop ? 'glass-card-elevated' : 'bg-[var(--color-background-secondary)]'} text-[var(--color-muted)]`
            }`}
          >
            {t(lang, langOption.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )

  const colorCard = (
    <div className={`${isDesktop ? 'glass-card-strong rounded-[30px] p-6' : 'bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5'} space-y-3`} style={isDesktop ? undefined : { boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-2">
        <span className="text-[18px]">🎨</span>
        <span className={`${isDesktop ? 'text-[16px]' : 'text-[15px]'} text-[var(--color-foreground)]`}>{t(lang, 'theme_color')}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {colorOptions.map((c) => (
          <button
            key={c.color}
            onClick={() => update({ primaryColor: c.color })}
            className={`h-8 w-8 rounded-full transition-transform active:scale-90 ${
              settings.primaryColor === c.color ? 'ring-2 ring-[var(--color-foreground)] ring-offset-2 scale-110' : ''
            }`}
            style={{ backgroundColor: c.color }}
            title={t(lang, c.labelKey)}
          />
        ))}
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <SettingsDesktopShell
        title={t(lang, 'theme_title')}
        description={t(lang, 'theme_desktop_desc')}
        onBack={goBack}
        sideTitle="Theme Snapshot"
        sideDescription={t(lang, 'theme_side_desc')}
        sideContent={
          <div className="space-y-6">
            <div className="glass-card-elevated rounded-[28px] p-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Current</p>
              <div className="mt-4 space-y-3">
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">{t(lang, 'theme_appearance')}：{t(lang, modeOptions.find((m) => m.key === settings.mode)?.labelKey || 'theme_system')}</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">{t(lang, 'theme_language')}：{t(lang, settings.language === 'zh-CN' ? 'lang_zh_CN' : settings.language === 'ja' ? 'lang_ja' : 'lang_en')}</div>
                <div className="rounded-[18px] bg-white/50 px-4 py-3 text-[14px] text-[var(--color-foreground)]/82">{t(lang, 'theme_color')}：{t(lang, colorOptions.find((item) => item.color === settings.primaryColor)?.labelKey || 'color_orange')}</div>
              </div>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
          <div className="space-y-6">
            {appearanceCard}
            {fontCard}
          </div>
          <div className="space-y-6">
            {languageCard}
            {colorCard}
          </div>
        </div>
      </SettingsDesktopShell>
    )
  }

  return (
    <div className="h-full flex justify-center bg-[var(--color-background-secondary)]">
      <div className="w-full max-w-[390px] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-[var(--color-card)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">{t(lang, 'theme_title')}</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">{t(lang, 'theme_appearance')}</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang, 'theme_appearance_desc')}</p>
            <div className="flex gap-2.5">
              {modeOptions.map((m) => (
                <button
                  key={m.key}
                  onClick={() => update({ mode: m.key })}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-[var(--radius-md)] transition-all ${
                    settings.mode === m.key
                      ? 'bg-[var(--color-card)] ring-[1.5px] ring-[var(--color-primary)] shadow-sm'
                      : 'bg-[var(--color-card)] ring-1 ring-[var(--color-border)]'
                  }`}
                >
                  <span className="text-[24px]">{m.icon}</span>
                  <span className={`text-[12px] font-medium ${settings.mode === m.key ? 'text-[var(--color-primary)] font-semibold' : 'text-[var(--color-muted)]'}`}>
                    {t(lang, m.labelKey)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <h2 className="text-[16px] font-semibold text-[var(--color-foreground)]">{t(lang, 'theme_font_size')}</h2>
            <p className="text-[12px] text-[var(--color-muted-light)]">{t(lang, 'theme_font_desc')}</p>

            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-muted)]">A</span>
              <div className="flex-1 relative h-6 flex items-center">
                <div className="absolute inset-x-0 h-1.5 bg-[var(--color-background-secondary)] rounded-full">
                  <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${(settings.fontSize / 2) * 100}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => update({ fontSize: parseInt(e.target.value, 10) })}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                />
                <div className="absolute inset-x-0 flex justify-between pointer-events-none">
                  {fontSizeOptions.map((f) => (
                    <div
                      key={f.value}
                      className={`w-3 h-3 rounded-full transition-all ${
                        f.value <= settings.fontSize
                          ? 'bg-[var(--color-primary)] scale-100'
                          : 'bg-[var(--color-border-dark)] scale-75'
                      } ${f.value === settings.fontSize ? 'ring-2 ring-[var(--color-primary)]/30 scale-125' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <span className="text-[20px] font-bold text-[var(--color-muted)]">A</span>
            </div>

            <div className="flex justify-between px-0.5">
              {fontSizeOptions.map((f) => (
                <button
                  key={f.value}
                  onClick={() => update({ fontSize: f.value })}
                  className={`text-[11px] ${settings.fontSize === f.value ? 'text-[var(--color-primary)] font-bold' : 'text-[var(--color-muted)]'}`}
                >
                  {t(lang, f.labelKey)}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-[var(--color-border)]">
              <p className="text-[var(--color-foreground)] leading-relaxed transition-all" style={{ fontSize: `${currentPreviewSize}px` }}>
                {t(lang, 'theme_preview')}
              </p>
            </div>
          </div>

          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[18px]">🌐</span>
                <span className="text-[15px] text-[var(--color-foreground)]">{t(lang, 'theme_language')}</span>
              </div>
              <span className="text-[13px] text-[var(--color-primary)]">{t(lang, settings.language === 'zh-CN' ? 'lang_zh_CN' : settings.language === 'ja' ? 'lang_ja' : 'lang_en')}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {languageOptionKeys.map((langOpt) => (
                <button
                  key={langOpt.value}
                  onClick={() => update({ language: langOpt.value })}
                  className={`px-3 py-1.5 rounded-full text-[12px] ${
                    settings.language === langOpt.value
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'
                  }`}
                >
                  {t(lang, langOpt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[var(--color-card)] rounded-[var(--radius-lg)] p-5 space-y-3" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-2">
              <span className="text-[18px]">🎨</span>
              <span className="text-[15px] text-[var(--color-foreground)]">{t(lang, 'theme_color')}</span>
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              {colorOptions.map((c) => (
                <button
                  key={c.color}
                  onClick={() => update({ primaryColor: c.color })}
                  className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${
                    settings.primaryColor === c.color ? 'ring-2 ring-offset-2 ring-[var(--color-foreground)] scale-110' : ''
                  }`}
                  style={{ backgroundColor: c.color }}
                  title={t(lang, c.labelKey)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
