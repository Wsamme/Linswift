export type AppLanguage = 'zh-CN' | 'en' | 'ja'

export interface ThemeSettings {
  mode: 'light' | 'dark' | 'system'
  fontSize: number
  language: AppLanguage
  primaryColor: string
}

export const THEME_STORAGE_KEY = 'linswift_theme_settings'
export const THEME_CHANGE_EVENT = 'linswift-theme-changed'

export const DEFAULT_THEME: ThemeSettings = {
  mode: 'light',
  fontSize: 1,
  language: 'zh-CN',
  primaryColor: '#FF8400',
}

const primaryLightMap: Record<string, string> = {
  '#FF8400': '#FFF5EB',
  '#3B82F6': '#E8F0FF',
  '#8B5CF6': '#F0EBFF',
  '#22C55E': '#E8F9EE',
  '#EF4444': '#FEE2E2',
  '#EC4899': '#FCE7F3',
}

const fontSizeMap = [14, 16, 18]

export function loadThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THEME }
    const parsed = { ...DEFAULT_THEME, ...JSON.parse(raw) }
    const normalizedLanguage: AppLanguage = parsed.language === 'en' || parsed.language === 'ja'
      ? parsed.language
      : 'zh-CN'
    return {
      ...parsed,
      language: normalizedLanguage,
      fontSize: Math.max(0, Math.min(2, Number(parsed.fontSize) || 1)),
    }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export function saveThemeSettings(settings: ThemeSettings) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

function resolveMode(mode: ThemeSettings['mode']): 'light' | 'dark' {
  if (mode !== 'system') return mode
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return dark ? 'dark' : 'light'
}

export function applyThemeSettings(settings: ThemeSettings) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const resolvedMode = resolveMode(settings.mode)
  const primaryLight = primaryLightMap[settings.primaryColor] || primaryLightMap['#FF8400']
  const fontPx = fontSizeMap[Math.max(0, Math.min(2, settings.fontSize))] || 16

  root.setAttribute('data-theme', resolvedMode)
  root.setAttribute('lang', settings.language)
  root.style.setProperty('--color-primary', settings.primaryColor)
  root.style.setProperty('--color-primary-light', primaryLight)
  root.style.setProperty('font-size', `${fontPx}px`)
}
