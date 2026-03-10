/**
 * STT（语音转文字）工具模块
 *
 * 使用浏览器原生 HTML5 Web Speech API (SpeechRecognition)
 * 支持功能：
 *   - 英文 / 中文语音识别
 *   - 实时中间结果 (interim results)
 *   - 持续识别模式
 *   - 置信度评分
 *   - 浏览器兼容性检测
 */

// ========== 类型定义 ==========

/** STT 识别回调选项 */
export interface STTOptions {
  /** 识别语言，默认 'en-US' */
  lang?: string
  /** 是否持续识别（不自动停止），默认 false */
  continuous?: boolean
  /** 是否返回中间结果，默认 true */
  interimResults?: boolean
  /** 识别到文本时的回调 */
  onResult: (text: string, isFinal: boolean) => void
  /** 发生错误时的回调 */
  onError?: (error: string) => void
  /** 识别结束时的回调 */
  onEnd?: () => void
}

// 浏览器兼容的 SpeechRecognition 构造函数
const SpeechRecognitionCtor =
  (window as any).SpeechRecognition ||
  (window as any).webkitSpeechRecognition ||
  null

// 当前活跃的识别实例
let activeRecognition: any = null

// ========== 核心函数 ==========

/**
 * 检查浏览器是否支持 SpeechRecognition
 */
export function isSTTSupported(): boolean {
  return SpeechRecognitionCtor !== null
}

/**
 * 启动语音识别
 * @param options - 识别配置
 * @returns 是否成功启动
 */
export function startRecognition(options: STTOptions): boolean {
  if (!isSTTSupported()) {
    options.onError?.('当前浏览器不支持语音识别，请使用 Chrome 或 Edge')
    return false
  }

  // 先停止已有的识别
  stopRecognition()

  const recognition = new SpeechRecognitionCtor()

  // 基础配置
  recognition.lang = options.lang || 'en-US'
  recognition.continuous = options.continuous ?? false
  recognition.interimResults = options.interimResults ?? true
  recognition.maxAlternatives = 1

  // 结果回调 —— 核心逻辑
  recognition.onresult = (event: any) => {
    let finalTranscript = ''
    let interimTranscript = ''

    // 遍历所有结果片段
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      const transcript = result[0].transcript

      if (result.isFinal) {
        finalTranscript += transcript
      } else {
        interimTranscript += transcript
      }
    }

    // 优先回调 final，否则回调 interim
    if (finalTranscript) {
      options.onResult(finalTranscript, true)
    } else if (interimTranscript) {
      options.onResult(interimTranscript, false)
    }
  }

  // 错误处理
  recognition.onerror = (event: any) => {
    const errorMap: Record<string, string> = {
      'no-speech': '没有检测到语音，请再试一次',
      'audio-capture': '未找到麦克风，请检查设备权限',
      'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许',
      'network': '网络连接出错，请检查网络',
      'aborted': '识别被中断',
    }
    const msg = errorMap[event.error] || `语音识别出错: ${event.error}`
    options.onError?.(msg)
  }

  // 识别结束
  recognition.onend = () => {
    activeRecognition = null
    options.onEnd?.()
  }

  // 启动
  try {
    recognition.start()
    activeRecognition = recognition
    return true
  } catch (err) {
    options.onError?.('启动语音识别失败，请刷新页面重试')
    return false
  }
}

/**
 * 停止当前语音识别
 */
export function stopRecognition(): void {
  if (activeRecognition) {
    try {
      activeRecognition.stop()
    } catch {
      // 已经停止了，忽略
    }
    activeRecognition = null
  }
}

/**
 * 检查是否正在识别
 */
export function isRecognizing(): boolean {
  return activeRecognition !== null
}

// ========== 评分工具函数 ==========

/**
 * 将文本规范化：去标点、转小写、合并空格
 * 用于对比评分
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, '') // 保留字母、数字、空格、撇号
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 逐词对比两段文本，返回差异信息
 * @param original - 原始文本
 * @param spoken   - 用户说的文本
 */
export function compareTexts(
  original: string,
  spoken: string
): { words: Array<{ original: string; spoken: string; match: boolean }>; accuracy: number } {
  const origWords = normalizeText(original).split(' ')
  const spokenWords = normalizeText(spoken).split(' ')

  // 简单的逐位对比（适用于复述场景）
  const maxLen = Math.max(origWords.length, spokenWords.length)
  let matchCount = 0
  const words: Array<{ original: string; spoken: string; match: boolean }> = []

  for (let i = 0; i < maxLen; i++) {
    const o = origWords[i] || ''
    const s = spokenWords[i] || ''
    const match = o === s
    if (match && o) matchCount++
    words.push({ original: o, spoken: s, match })
  }

  const accuracy = origWords.length > 0
    ? Math.round((matchCount / origWords.length) * 100)
    : 0

  return { words, accuracy }
}
