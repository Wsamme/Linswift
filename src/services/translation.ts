import { analyzeUnfamiliarWords, type UnfamiliarWord } from './gemini'

export type { UnfamiliarWord } from './gemini'

const MOONSHOT_API_KEY = import.meta.env.VITE_MOONSHOT_API_KEY as string | undefined
const MOONSHOT_API_BASE = 'https://api.moonshot.cn/v1'
const MOONSHOT_MODEL = 'moonshot-v1-8k'

export type TranslationMode = 'hybrid' | 'deepl' | 'ai'
export type TranslationProvider = 'deepl' | 'moonshot' | 'fallback'
export type VocabularyProvider = 'moonshot' | 'fallback' | 'none'

export interface TranslateResult {
  translatedText: string
  unfamiliarWords: UnfamiliarWord[]
  mode: TranslationMode
  translationProvider: TranslationProvider
  vocabularyProvider: VocabularyProvider
  notes: string[]
}

interface DeepLTranslationResponse {
  translatedText: string
  detectedSourceLanguage?: string
}

interface MoonshotTranslationPayload {
  translatedText?: string
}

function normalizeLanguageLabel(language: string) {
  return String(language || '').trim().toLowerCase()
}

function isEnglishLanguage(language: string) {
  const normalized = normalizeLanguageLabel(language)
  return normalized === 'english'
    || normalized === 'en'
    || normalized === 'en-us'
    || normalized === 'en-gb'
    || normalized.includes('英语')
}

function resolveWordAnalysisText(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string
) {
  if (isEnglishLanguage(sourceLang)) return sourceText
  if (isEnglishLanguage(targetLang)) return translatedText
  return ''
}

function resolveDeepLProxyBaseUrl() {
  const configuredBase = String(import.meta.env.VITE_DEEPL_PROXY_BASE_URL || '').trim()
  if (configuredBase) return configuredBase.replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    const { origin, protocol, hostname } = window.location
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    if ((protocol === 'http:' || protocol === 'https:') && !isLocalhost) return origin
  }

  return 'https://www.linswift.com'
}

function buildDeepLProxyUrl() {
  return `${resolveDeepLProxyBaseUrl()}/api/deepl/translate`
}

async function callMoonshot(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  systemPrompt?: string
): Promise<string | null> {
  if (!MOONSHOT_API_KEY) return null

  try {
    const allMessages = systemPrompt
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${MOONSHOT_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MOONSHOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: MOONSHOT_MODEL,
        messages: allMessages,
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Moonshot 翻译 API 错误:', response.status, errorText)
      return null
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content ?? null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Moonshot 翻译调用失败:', message)
    return null
  }
}

function parseJSON<T>(raw: string): T | null {
  const stripComments = (input: string) => {
    let result = ''
    let inString = false
    let escaped = false
    let inLineComment = false
    let inBlockComment = false

    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]
      const next = input[index + 1]

      if (inLineComment) {
        if (current === '\n') {
          inLineComment = false
          result += current
        }
        continue
      }

      if (inBlockComment) {
        if (current === '*' && next === '/') {
          inBlockComment = false
          index += 1
        }
        continue
      }

      if (inString) {
        result += current
        if (escaped) {
          escaped = false
        } else if (current === '\\') {
          escaped = true
        } else if (current === '"') {
          inString = false
        }
        continue
      }

      if (current === '"') {
        inString = true
        result += current
        continue
      }

      if (current === '/' && next === '/') {
        inLineComment = true
        index += 1
        continue
      }

      if (current === '/' && next === '*') {
        inBlockComment = true
        index += 1
        continue
      }

      result += current
    }

    return result
  }

  const extractJsonCandidate = (input: string) => {
    const trimmed = input.trim()
    const objectStart = trimmed.indexOf('{')
    const arrayStart = trimmed.indexOf('[')
    const startCandidates = [objectStart, arrayStart].filter(index => index >= 0)
    if (startCandidates.length === 0) return trimmed

    const start = Math.min(...startCandidates)
    const opener = trimmed[start]
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < trimmed.length; index += 1) {
      const current = trimmed[index]

      if (inString) {
        if (escaped) {
          escaped = false
        } else if (current === '\\') {
          escaped = true
        } else if (current === '"') {
          inString = false
        }
        continue
      }

      if (current === '"') {
        inString = true
        continue
      }

      if (current === opener) depth += 1
      if (current === closer) {
        depth -= 1
        if (depth === 0) {
          return trimmed.slice(start, index + 1)
        }
      }
    }

    return trimmed.slice(start)
  }

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const normalized = stripComments(extractJsonCandidate(cleaned)).trim()
    return JSON.parse(normalized) as T
  } catch {
    return null
  }
}

async function translateWithAIOnly(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  const prompt = `你是一个专业翻译助手。请只完成翻译，不要解释。

任务：
- 将以下${sourceLang}文本翻译成${targetLang}
- 尽量自然、地道、符合目标语言表达
- 保留数字、百分比、专有名词和原文语气

输入文本：
"${text}"

请严格返回合法 JSON：
{
  "translatedText": "翻译结果"
}`

  const raw = await callMoonshot([{ role: 'user', content: prompt }])
  if (!raw) return null

  const parsed = parseJSON<MoonshotTranslationPayload>(raw)
  if (parsed?.translatedText?.trim()) return parsed.translatedText.trim()

  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  if (cleaned) return cleaned.replace(/^"|"$/g, '')
  return null
}

async function analyzeVocabularyForTranslation(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string
): Promise<{ words: UnfamiliarWord[]; provider: VocabularyProvider; note?: string }> {
  const analysisText = resolveWordAnalysisText(sourceText, translatedText, sourceLang, targetLang)
  if (!analysisText.trim()) {
    return { words: [], provider: 'none' }
  }

  try {
    const words = await analyzeUnfamiliarWords(analysisText, 5)
    return { words, provider: MOONSHOT_API_KEY ? 'moonshot' : 'fallback' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      words: [],
      provider: 'fallback',
      note: `陌生词分析失败，已跳过：${message}`,
    }
  }
}

async function translateWithDeepL(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<DeepLTranslationResponse> {
  const response = await fetch(buildDeepLProxyUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      sourceLang,
      targetLang,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : 'DeepL 翻译暂时不可用'
    throw new Error(message)
  }

  if (!payload?.translatedText || typeof payload.translatedText !== 'string') {
    throw new Error('DeepL 返回结果无效')
  }

  return {
    translatedText: payload.translatedText,
    detectedSourceLanguage: payload.detectedSourceLanguage,
  }
}

function fallbackTranslate(text: string, targetLang: string): string {
  const isToEnglish = isEnglishLanguage(targetLang)
  if (isToEnglish) return `[AI offline] Translation of: "${text}"`
  return `[AI 离线] ${targetLang}翻译：「${text}」`
}

async function translateViaAIFlow(
  text: string,
  sourceLang: string,
  targetLang: string,
  mode: TranslationMode,
  notes: string[] = []
): Promise<TranslateResult> {
  const translatedText = await translateWithAIOnly(text, sourceLang, targetLang)
  const safeTranslation = translatedText || fallbackTranslate(text, targetLang)
  const translationProvider: TranslationProvider = translatedText ? 'moonshot' : 'fallback'

  const analysis = await analyzeVocabularyForTranslation(text, safeTranslation, sourceLang, targetLang)
  if (analysis.note) notes.push(analysis.note)

  return {
    translatedText: safeTranslation,
    unfamiliarWords: analysis.words,
    mode,
    translationProvider,
    vocabularyProvider: analysis.provider,
    notes,
  }
}

export async function translateText(
  text: string,
  sourceLang: string = '中文',
  targetLang: string = 'English',
  mode: TranslationMode = 'hybrid'
): Promise<TranslateResult> {
  const safeText = text.trim()
  if (!safeText) {
    return {
      translatedText: '',
      unfamiliarWords: [],
      mode,
      translationProvider: 'fallback',
      vocabularyProvider: 'none',
      notes: [],
    }
  }

  if (mode === 'ai') {
    return translateViaAIFlow(safeText, sourceLang, targetLang, mode)
  }

  try {
    const deeplResult = await translateWithDeepL(safeText, sourceLang, targetLang)

    if (mode === 'deepl') {
      return {
        translatedText: deeplResult.translatedText,
        unfamiliarWords: [],
        mode,
        translationProvider: 'deepl',
        vocabularyProvider: 'none',
        notes: [],
      }
    }

    const analysis = await analyzeVocabularyForTranslation(
      safeText,
      deeplResult.translatedText,
      sourceLang,
      targetLang
    )
    const notes: string[] = []
    if (analysis.note) notes.push(analysis.note)

    return {
      translatedText: deeplResult.translatedText,
      unfamiliarWords: analysis.words,
      mode,
      translationProvider: 'deepl',
      vocabularyProvider: analysis.provider,
      notes,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallbackNotes = [`DeepL 暂不可用，已回退到 AI：${message}`]
    return translateViaAIFlow(safeText, sourceLang, targetLang, mode, fallbackNotes)
  }
}
