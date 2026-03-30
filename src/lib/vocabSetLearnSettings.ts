import { normalizeDailyGoal } from './learnSettings'

const VOCAB_SET_LEARN_SETTINGS_KEY = 'linswift_vocab_set_learn_settings'

export interface VocabSetLearnSettings {
  dailyGoal: number
}

type VocabSetLearnSettingsMap = Record<string, VocabSetLearnSettings>

function buildStorageKey(userId: string) {
  return `${VOCAB_SET_LEARN_SETTINGS_KEY}:${userId}`
}

export function normalizeVocabSetLearnSettings(
  value?: Partial<VocabSetLearnSettings> | null,
  fallbackDailyGoal = 20
): VocabSetLearnSettings {
  return {
    dailyGoal: normalizeDailyGoal(value?.dailyGoal ?? fallbackDailyGoal),
  }
}

function normalizePersistedSettings(
  persistedSettings?: Partial<VocabSetLearnSettings> | null,
  fallbackDailyGoal = 20
) {
  if (!persistedSettings) return null
  return normalizeVocabSetLearnSettings(persistedSettings, fallbackDailyGoal)
}

export function loadVocabSetLearnSettingsMap(userId?: string | null): VocabSetLearnSettingsMap {
  try {
    if (typeof window === 'undefined' || !userId) return {}
    const raw = window.localStorage.getItem(buildStorageKey(userId))
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, Partial<VocabSetLearnSettings>>
    return Object.entries(parsed).reduce<VocabSetLearnSettingsMap>((acc, [setId, settings]) => {
      acc[setId] = normalizeVocabSetLearnSettings(settings)
      return acc
    }, {})
  } catch {
    return {}
  }
}

function saveVocabSetLearnSettingsMap(userId: string, settingsMap: VocabSetLearnSettingsMap) {
  if (typeof window === 'undefined' || !userId) return
  window.localStorage.setItem(buildStorageKey(userId), JSON.stringify(settingsMap))
}

export function getVocabSetLearnSettings(
  userId: string | null | undefined,
  setId: number | string | null | undefined,
  fallbackDailyGoal = 20,
  persistedSettings?: Partial<VocabSetLearnSettings> | null
): VocabSetLearnSettings {
  const normalizedSetId = Number(setId)
  const normalizedPersisted = normalizePersistedSettings(persistedSettings, fallbackDailyGoal)
  if (!userId || !Number.isFinite(normalizedSetId) || normalizedSetId <= 0) {
    return normalizedPersisted || normalizeVocabSetLearnSettings(undefined, fallbackDailyGoal)
  }

  const settingsMap = loadVocabSetLearnSettingsMap(userId)
  const localSettings = settingsMap[String(normalizedSetId)]
  if (localSettings) {
    return normalizeVocabSetLearnSettings(localSettings, normalizedPersisted?.dailyGoal ?? fallbackDailyGoal)
  }

  return normalizedPersisted || normalizeVocabSetLearnSettings(undefined, fallbackDailyGoal)
}

export function ensureVocabSetLearnSettings(
  userId: string | null | undefined,
  setId: number | string | null | undefined,
  fallbackDailyGoal = 20,
  persistedSettings?: Partial<VocabSetLearnSettings> | null
): VocabSetLearnSettings {
  const normalizedSetId = Number(setId)
  const normalizedPersisted = normalizePersistedSettings(persistedSettings, fallbackDailyGoal)
  if (!userId || !Number.isFinite(normalizedSetId) || normalizedSetId <= 0) {
    return normalizedPersisted || normalizeVocabSetLearnSettings(undefined, fallbackDailyGoal)
  }

  const settingsMap = loadVocabSetLearnSettingsMap(userId)
  const nextSettings = normalizeVocabSetLearnSettings(
    settingsMap[String(normalizedSetId)] || normalizedPersisted,
    normalizedPersisted?.dailyGoal ?? fallbackDailyGoal
  )

  if (!settingsMap[String(normalizedSetId)]) {
    settingsMap[String(normalizedSetId)] = nextSettings
    saveVocabSetLearnSettingsMap(userId, settingsMap)
  }

  return nextSettings
}

export function saveVocabSetLearnSettings(
  userId: string | null | undefined,
  setId: number | string | null | undefined,
  settings: Partial<VocabSetLearnSettings>,
  fallbackDailyGoal = 20
): VocabSetLearnSettings {
  const normalizedSetId = Number(setId)
  if (!userId || !Number.isFinite(normalizedSetId) || normalizedSetId <= 0) {
    return normalizeVocabSetLearnSettings(settings, fallbackDailyGoal)
  }

  const settingsMap = loadVocabSetLearnSettingsMap(userId)
  const nextSettings = normalizeVocabSetLearnSettings(settings, fallbackDailyGoal)
  settingsMap[String(normalizedSetId)] = nextSettings
  saveVocabSetLearnSettingsMap(userId, settingsMap)
  return nextSettings
}
