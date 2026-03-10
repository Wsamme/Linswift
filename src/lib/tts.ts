/**
 * TTS（文本转语音）工具模块
 *
 * 使用浏览器原生 HTML5 SpeechSynthesis API，零成本
 * 支持功能：
 *   - 英文 / 中文发音
 *   - 口音选择（美式、英式、澳式）
 *   - 语速调节（0.5x ~ 2.0x）
 *   - 音量调节（0 ~ 1）
 *   - 设置持久化到 localStorage
 *   - 自动播放、循环播放等偏好
 */

// ========== 类型定义 ==========

/** 支持的口音类型 */
export type AccentType = 'en-US' | 'en-GB' | 'en-AU'

/** 口音的中文标签，方便 UI 显示 */
export const ACCENT_LABELS: Record<AccentType, string> = {
  'en-US': '美式英语',
  'en-GB': '英式英语',
  'en-AU': '澳式英语',
}

/** 口音对应的国旗 emoji */
export const ACCENT_FLAGS: Record<AccentType, string> = {
  'en-US': '🇺🇸',
  'en-GB': '🇬🇧',
  'en-AU': '🇦🇺',
}

/** 预设语速选项 */
export const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '0.75x', value: 0.75 },
  { label: '1.0x', value: 1.0 },
  { label: '1.25x', value: 1.25 },
  { label: '1.5x', value: 1.5 },
  { label: '2.0x', value: 2.0 },
] as const

/** TTS 设置的完整结构 */
export interface TTSSettings {
  accent: AccentType       // 口音：美式 / 英式 / 澳式
  rate: number             // 语速：0.5 ~ 2.0
  volume: number           // 音量：0 ~ 1
  autoPlay: boolean        // 自动播放发音（翻页时自动朗读单词）
  wordPronounce: boolean   // 学习时朗读单词
  sentencePronounce: boolean // 学习时朗读例句
  loopPlay: boolean        // 循环播放
}

// ========== 默认设置 ==========

/** 默认的 TTS 设置值 */
export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  accent: 'en-US',
  rate: 1.0,
  volume: 0.8,
  autoPlay: true,
  wordPronounce: true,
  sentencePronounce: false,
  loopPlay: false,
}

// localStorage 中存储的 key
const STORAGE_KEY = 'linswift_tts_settings'

// ========== 设置的读写（localStorage 持久化） ==========

/**
 * 从 localStorage 读取 TTS 设置
 * 如果没有保存过，返回默认值
 */
export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TTS_SETTINGS }

    const saved = JSON.parse(raw)
    // 合并默认值，防止旧版本缺字段
    return { ...DEFAULT_TTS_SETTINGS, ...saved }
  } catch {
    return { ...DEFAULT_TTS_SETTINGS }
  }
}

/**
 * 保存 TTS 设置到 localStorage
 * @param settings - 完整的或部分的设置对象
 */
export function saveTTSSettings(settings: Partial<TTSSettings>): TTSSettings {
  const current = loadTTSSettings()
  const merged = { ...current, ...settings }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    console.warn('TTS 设置保存失败')
  }

  return merged
}

// ========== 语音引擎工具函数 ==========

/**
 * 获取浏览器中可用的语音列表
 * 注意：语音列表是异步加载的，首次调用可能为空
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  return window.speechSynthesis.getVoices()
}

/**
 * 等待语音列表加载完毕（异步）
 * 部分浏览器需要等待 voiceschanged 事件
 */
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = getAvailableVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }
    // 等待浏览器加载完语音列表
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      resolve(getAvailableVoices())
    }, { once: true })

    // 3 秒超时保护，避免永远等下去
    setTimeout(() => resolve(getAvailableVoices()), 3000)
  })
}

/**
 * 根据口音设置，查找最佳匹配的英文语音
 * 优先级：精确匹配 lang > 同语系 > 任意英文
 */
function findBestVoice(accent: AccentType): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices()
  if (voices.length === 0) return null

  // 1. 精确匹配：lang 完全一致（如 en-US）
  const exact = voices.find(v => v.lang === accent)
  if (exact) return exact

  // 2. 前缀匹配：lang 以 accent 的前两位开头（如 en）
  const prefix = accent.split('-')[0]
  const partial = voices.find(v => v.lang.startsWith(prefix) && v.localService)
  if (partial) return partial

  // 3. 兜底：任何英文语音
  const anyEn = voices.find(v => v.lang.startsWith('en'))
  return anyEn || null
}

/**
 * 查找中文语音
 */
function findChineseVoice(): SpeechSynthesisVoice | null {
  const voices = getAvailableVoices()
  // 优先找本地中文语音
  const local = voices.find(v => v.lang.startsWith('zh') && v.localService)
  if (local) return local
  // 兜底：任何中文语音
  return voices.find(v => v.lang.startsWith('zh')) || null
}

// ========== 核心发音函数 ==========

// 当前的循环计时器 ID（用于循环播放时取消）
let loopTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 朗读英文文本
 * 会自动读取 localStorage 中保存的设置（口音、语速、音量等）
 *
 * @param text  - 要朗读的英文文本
 * @param overrideRate - 可选，临时覆盖语速（不影响保存的设置）
 */
export function speakEnglish(text: string, overrideRate?: number) {
  if (!('speechSynthesis' in window)) {
    console.warn('当前浏览器不支持 SpeechSynthesis API')
    return
  }

  // 停止当前朗读 & 清除循环计时器
  stopSpeaking()

  const settings = loadTTSSettings()
  const utterance = new SpeechSynthesisUtterance(text)

  // 使用设置中的口音
  utterance.lang = settings.accent
  utterance.rate = overrideRate ?? settings.rate
  utterance.volume = settings.volume
  utterance.pitch = 1

  // 尝试匹配最佳语音
  const voice = findBestVoice(settings.accent)
  if (voice) utterance.voice = voice

  // 如果开启了循环播放，朗读结束后重新播放
  if (settings.loopPlay) {
    utterance.onend = () => {
      loopTimer = setTimeout(() => {
        speakEnglish(text, overrideRate)
      }, 800) // 间隔 0.8 秒后重复
    }
  }

  window.speechSynthesis.speak(utterance)
}

/**
 * 朗读中文文本
 * @param text  - 要朗读的中文文本
 * @param rate  - 可选，临时覆盖语速
 */
export function speakChinese(text: string, rate?: number) {
  if (!('speechSynthesis' in window)) return

  stopSpeaking()

  const settings = loadTTSSettings()
  const utterance = new SpeechSynthesisUtterance(text)

  utterance.lang = 'zh-CN'
  utterance.rate = rate ?? settings.rate
  utterance.volume = settings.volume
  utterance.pitch = 1

  const voice = findChineseVoice()
  if (voice) utterance.voice = voice

  window.speechSynthesis.speak(utterance)
}

/**
 * 智能发音：自动检测文本语言并朗读
 * 主要通过检测是否包含中文字符来判断
 */
export function speakAuto(text: string) {
  // 统计中文字符占比
  const chineseRatio = (text.match(/[\u4e00-\u9fff]/g) || []).length / text.length

  if (chineseRatio > 0.3) {
    // 中文占比超过 30%，用中文语音
    speakChinese(text)
  } else {
    // 否则用英文语音
    speakEnglish(text)
  }
}

/**
 * 停止当前朗读（包括取消循环播放）
 */
export function stopSpeaking() {
  // 清除循环计时器
  if (loopTimer) {
    clearTimeout(loopTimer)
    loopTimer = null
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/**
 * 检查当前是否正在朗读
 */
export function isSpeaking(): boolean {
  if (!('speechSynthesis' in window)) return false
  return window.speechSynthesis.speaking
}

/**
 * 检查浏览器是否支持 SpeechSynthesis
 */
export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window
}
