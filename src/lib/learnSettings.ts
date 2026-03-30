export const LEARN_SETTINGS_KEY = 'linswift_learn_settings'
export const DAILY_GOAL_MIN = 1
export const DAILY_GOAL_MAX = 999

export interface LearnSettings {
  dailyGoal: number
  learningMode: 'listen' | 'read' | 'write'
  showExamples: boolean
  reviewReminder: boolean
  reviewCycleDays: 7 | 15
}

export const DEFAULT_LEARN_SETTINGS: LearnSettings = {
  dailyGoal: 20,
  learningMode: 'listen',
  showExamples: false,
  reviewReminder: true,
  reviewCycleDays: 7,
}

export function normalizeDailyGoal(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LEARN_SETTINGS.dailyGoal
  }
  return Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, Math.round(parsed)))
}

export function normalizeLearnSettings(value?: Partial<LearnSettings> | null): LearnSettings {
  return {
    dailyGoal: normalizeDailyGoal(value?.dailyGoal),
    learningMode:
      value?.learningMode === 'read' || value?.learningMode === 'write'
        ? value.learningMode
        : DEFAULT_LEARN_SETTINGS.learningMode,
    showExamples: typeof value?.showExamples === 'boolean'
      ? value.showExamples
      : DEFAULT_LEARN_SETTINGS.showExamples,
    reviewReminder: typeof value?.reviewReminder === 'boolean'
      ? value.reviewReminder
      : DEFAULT_LEARN_SETTINGS.reviewReminder,
    reviewCycleDays: value?.reviewCycleDays === 15 ? 15 : 7,
  }
}

export function loadLearnSettings(): LearnSettings {
  try {
    if (typeof window === 'undefined') return { ...DEFAULT_LEARN_SETTINGS }
    const raw = window.localStorage.getItem(LEARN_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_LEARN_SETTINGS }
    return normalizeLearnSettings(JSON.parse(raw) as Partial<LearnSettings>)
  } catch {
    return { ...DEFAULT_LEARN_SETTINGS }
  }
}

export function saveLearnSettings(settings: LearnSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LEARN_SETTINGS_KEY, JSON.stringify(normalizeLearnSettings(settings)))
}

export function getDailyNewWordGoal(): number {
  return loadLearnSettings().dailyGoal
}
