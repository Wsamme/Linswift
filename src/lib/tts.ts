/**
 * TTS（文本转语音）工具模块
 */

export type AccentType = 'en-US' | 'en-GB' | 'en-AU'

export const ACCENT_LABELS: Record<AccentType, string> = {
  'en-US': '美式英语',
  'en-GB': '英式英语',
  'en-AU': '澳式英语',
}

export const ACCENT_FLAGS: Record<AccentType, string> = {
  'en-US': '🇺🇸',
  'en-GB': '🇬🇧',
  'en-AU': '🇦🇺',
}

export const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1.0x', value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 },
] as const

export interface TTSSettings {
  accent: AccentType
  rate: number
  volume: number
  autoPlay: boolean
  wordPronounce: boolean
  sentencePronounce: boolean
  loopPlay: boolean
}

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  accent: 'en-US',
  rate: 1.0,
  volume: 0.8,
  autoPlay: true,
  wordPronounce: true,
  sentencePronounce: false,
  loopPlay: false,
}

const STORAGE_KEY = 'linswift_tts_settings'
const NOVELTY_ENGLISH_VOICE_NAMES = [
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'fred',
  'good news',
  'jester',
  'organ',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
] as const

const PREFERRED_ENGLISH_VOICE_NAMES: Record<AccentType, string[]> = {
  'en-US': ['samantha', 'allison', 'ava', 'sandy', 'shelley', 'reed', 'rocko', 'flo', 'eddy', 'kathy', 'albert'],
  'en-GB': ['daniel', 'serena', 'arthur', 'sandy', 'shelley', 'reed', 'rocko', 'flo', 'eddy'],
  'en-AU': ['karen', 'lee', 'olivia'],
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeSettings(input: Partial<TTSSettings> | null | undefined): TTSSettings {
  const merged = { ...DEFAULT_TTS_SETTINGS, ...(input || {}) } as TTSSettings
  const accent: AccentType = merged.accent === 'en-GB' || merged.accent === 'en-AU' || merged.accent === 'en-US'
    ? merged.accent
    : DEFAULT_TTS_SETTINGS.accent

  const rateRaw = Number(merged.rate)
  const volumeRaw = Number(merged.volume)
  const safeRate = Number.isFinite(rateRaw) ? clamp(rateRaw, 0.5, 2) : DEFAULT_TTS_SETTINGS.rate
  // 避免历史异常配置把音量设成 0 导致全局静默
  const safeVolume = Number.isFinite(volumeRaw)
    ? (volumeRaw <= 0 ? DEFAULT_TTS_SETTINGS.volume : clamp(volumeRaw, 0, 1))
    : DEFAULT_TTS_SETTINGS.volume

  return {
    accent,
    rate: safeRate,
    volume: safeVolume,
    autoPlay: Boolean(merged.autoPlay),
    wordPronounce: Boolean(merged.wordPronounce),
    sentencePronounce: Boolean(merged.sentencePronounce),
    loopPlay: Boolean(merged.loopPlay),
  }
}

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TTS_SETTINGS }
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_TTS_SETTINGS }
  }
}

export function saveTTSSettings(settings: Partial<TTSSettings>): TTSSettings {
  const current = loadTTSSettings()
  const merged = normalizeSettings({ ...current, ...settings })

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    console.warn('TTS 设置保存失败')
  }

  return merged
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices()
}

export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = getAvailableVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }

    window.speechSynthesis.addEventListener('voiceschanged', () => {
      resolve(getAvailableVoices())
    }, { once: true })

    setTimeout(() => resolve(getAvailableVoices()), 3000)
  })
}

function scoreEnglishVoice(voice: SpeechSynthesisVoice, accent: AccentType): number {
  const lowerName = voice.name.trim().toLowerCase()
  const preferredNames = PREFERRED_ENGLISH_VOICE_NAMES[accent]
  let score = 0

  if (voice.lang === accent) {
    // Exact region match (e.g. en-GB voice for en-GB accent)
    score += 500
  } else if (voice.lang.startsWith('en-') && voice.lang !== accent) {
    // Wrong English region (e.g. en-US voice when en-GB is wanted)
    // Still usable but heavily penalized so correct region wins
    score -= 200
  } else if (voice.lang === 'en') {
    // Generic 'en' without region — neutral, slight bonus
    score += 100
  }

  if (voice.localService) score += 60
  if (voice.default) score += 20

  const preferredIndex = preferredNames.findIndex((name) => lowerName.includes(name))
  if (preferredIndex >= 0) {
    score += 220 - preferredIndex * 8
  }

  if (NOVELTY_ENGLISH_VOICE_NAMES.some((name) => lowerName.includes(name))) {
    score -= 500
  }

  return score
}

function findBestVoice(accent: AccentType): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices()
  if (voices.length === 0) return null

  const ranked = voices
    .filter((voice) => voice.lang.startsWith('en'))
    .map((voice) => ({ voice, score: scoreEnglishVoice(voice, accent) }))
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.voice || null
}

export function findPreferredVoiceByLang(languageCode: string): SpeechSynthesisVoice | null {
  const normalized = String(languageCode || '').trim()
  if (!normalized) return null

  if (normalized === 'en-US' || normalized === 'en-GB' || normalized === 'en-AU') {
    return findBestVoice(normalized)
  }

  const voices = getAvailableVoices()
  const exactLocal = voices.find((voice) => voice.lang === normalized && voice.localService)
  if (exactLocal) return exactLocal

  const exact = voices.find((voice) => voice.lang === normalized)
  if (exact) return exact

  const prefix = normalized.split('-')[0]
  const prefixLocal = voices.find((voice) => voice.lang.startsWith(prefix) && voice.localService)
  if (prefixLocal) return prefixLocal

  return voices.find((voice) => voice.lang.startsWith(prefix)) || null
}

function findChineseVoice(): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices()
  const local = voices.find(v => v.lang.startsWith('zh') && v.localService)
  if (local) return local
  return voices.find(v => v.lang.startsWith('zh')) || null
}

function findJapaneseVoice(): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices()
  const exactLocal = voices.find(v => v.lang === 'ja-JP' && v.localService)
  if (exactLocal) return exactLocal
  const exact = voices.find(v => v.lang === 'ja-JP')
  if (exact) return exact
  const nameMatched = voices.find(v => /japanese|nihongo|kyoko|otoya|haruka|sayaka/i.test(v.name))
  if (nameMatched) return nameMatched
  const local = voices.find(v => v.lang.startsWith('ja') && v.localService)
  if (local) return local
  return voices.find(v => v.lang.startsWith('ja')) || null
}

let loopTimer: ReturnType<typeof setTimeout> | null = null

function speakWithRetry(createUtterance: () => SpeechSynthesisUtterance) {
  const synth = window.speechSynthesis
  let started = false
  let retryScheduled = true
  const first = createUtterance()

  first.onstart = () => {
    started = true
    retryScheduled = false
  }

  first.onend = () => {
    retryScheduled = false
  }

  first.onerror = () => {
    retryScheduled = false
  }

  synth.speak(first)

  // 某些浏览器首次 speak 会静默且不触发 onstart，自动补一次。
  // 但如果浏览器已经进入 speaking/pending，就不要再次补播，否则 Chrome 会听起来像重复播放。
  setTimeout(() => {
    if (!retryScheduled || started || synth.speaking || synth.pending) return
    synth.cancel()
    synth.speak(createUtterance())
  }, 280)
}

export function speakEnglish(text: string, overrideRate?: number) {
  if (!('speechSynthesis' in window)) {
    console.warn('当前浏览器不支持 SpeechSynthesis API')
    return
  }

  const safeText = text?.trim()
  if (!safeText) return

  stopSpeaking()

  const speakNow = () => {
    const settings = loadTTSSettings()
    const createUtterance = () => {
      const utterance = new SpeechSynthesisUtterance(safeText)
      utterance.lang = settings.accent
      utterance.rate = overrideRate ?? settings.rate
      utterance.volume = settings.volume
      utterance.pitch = 1

      const voice = findBestVoice(settings.accent)
      if (voice) utterance.voice = voice

      if (settings.loopPlay) {
        utterance.onend = () => {
          loopTimer = setTimeout(() => {
            speakEnglish(safeText, overrideRate)
          }, 800)
        }
      }

      return utterance
    }

    speakWithRetry(createUtterance)
  }

  if (getAvailableVoices().length === 0) {
    void waitForVoices().then(speakNow)
  } else {
    speakNow()
  }
}

export function speakChinese(text: string, rate?: number) {
  if (!('speechSynthesis' in window)) return

  const safeText = text?.trim()
  if (!safeText) return

  stopSpeaking()

  const speakNow = () => {
    const settings = loadTTSSettings()
    const createUtterance = () => {
      const utterance = new SpeechSynthesisUtterance(safeText)
      utterance.lang = 'zh-CN'
      utterance.rate = rate ?? settings.rate
      utterance.volume = settings.volume
      utterance.pitch = 1
      const voice = findChineseVoice()
      if (voice) utterance.voice = voice
      return utterance
    }

    speakWithRetry(createUtterance)
  }

  if (getAvailableVoices().length === 0) {
    void waitForVoices().then(speakNow)
  } else {
    speakNow()
  }
}

export function speakJapanese(text: string, rate?: number) {
  if (!('speechSynthesis' in window)) return

  const safeText = text?.trim()
  if (!safeText) return

  stopSpeaking()

  const speakNow = () => {
    const settings = loadTTSSettings()
    const createUtterance = () => {
      const utterance = new SpeechSynthesisUtterance(safeText)
      utterance.lang = 'ja-JP'
      utterance.rate = rate ?? settings.rate
      utterance.volume = settings.volume
      utterance.pitch = 1
      const voice = findJapaneseVoice()
      if (voice) utterance.voice = voice
      return utterance
    }

    speakWithRetry(createUtterance)
  }

  if (getAvailableVoices().length === 0) {
    void waitForVoices().then(speakNow)
  } else {
    speakNow()
  }
}

export function speakAuto(text: string) {
  const safeText = text?.trim()
  if (!safeText) return

  const japaneseRatio = (safeText.match(/[\u3040-\u30ff]/g) || []).length / safeText.length
  const chineseRatio = (safeText.match(/[\u4e00-\u9fff]/g) || []).length / safeText.length

  if (japaneseRatio > 0.12) {
    speakJapanese(safeText)
    return
  }

  if (chineseRatio > 0.2) {
    speakChinese(safeText)
    return
  }

  speakEnglish(safeText)
}

export function stopSpeaking() {
  if (loopTimer) {
    clearTimeout(loopTimer)
    loopTimer = null
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export function isSpeaking(): boolean {
  if (!('speechSynthesis' in window)) return false
  return window.speechSynthesis.speaking
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window
}
