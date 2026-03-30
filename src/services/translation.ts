import { analyzeUnfamiliarWords, type UnfamiliarWord } from './gemini'
import { callMoonshot as callMoonshotClient } from './moonshotClient'

export type { UnfamiliarWord } from './gemini'

const MOONSHOT_API_KEY = import.meta.env.VITE_MOONSHOT_API_KEY as string | undefined
const MOONSHOT_API_BASE = 'https://api.moonshot.ai/v1'
const MOONSHOT_TRANSLATION_MODEL = String(
  import.meta.env.VITE_MOONSHOT_TRANSLATION_MODEL || 'moonshot-v1-auto'
).trim() || 'moonshot-v1-auto'
const MOONSHOT_TRANSLATION_TEMPERATURE = (() => {
  const raw = Number(import.meta.env.VITE_MOONSHOT_TRANSLATION_TEMPERATURE ?? 0)
  if (!Number.isFinite(raw)) return 0
  return Math.min(Math.max(raw, 0), 1.5)
})()

export type TranslationMode = 'hybrid' | 'deepl' | 'ai'
export type TranslationProvider = 'deepl' | 'moonshot' | 'fallback'
export type VocabularyProvider = 'moonshot' | 'fallback' | 'none' | 'loading'

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

interface TranslationCoreResult {
  translatedText: string
  translationProvider: TranslationProvider
  notes: string[]
}

interface VocabularyAnalysisResult {
  words: UnfamiliarWord[]
  provider: Exclude<VocabularyProvider, 'loading'>
  note?: string
}

const translationCache = new Map<string, TranslationCoreResult>()
const translationInflight = new Map<string, Promise<TranslationCoreResult>>()
const vocabularyCache = new Map<string, VocabularyAnalysisResult>()
const vocabularyInflight = new Map<string, Promise<VocabularyAnalysisResult>>()

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

function shouldAnalyzeVocabulary(sourceLang: string, targetLang: string) {
  return isEnglishLanguage(sourceLang) || isEnglishLanguage(targetLang)
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

function dedupeNotes(notes: string[]) {
  return Array.from(new Set(notes.filter(Boolean)))
}

function buildTranslationCacheKey(
  mode: TranslationMode,
  text: string,
  sourceLang: string,
  targetLang: string
) {
  return [
    mode,
    normalizeLanguageLabel(sourceLang),
    normalizeLanguageLabel(targetLang),
    text.trim(),
  ].join('::')
}

function buildVocabularyCacheKey(text: string, maxWords: number) {
  return `${maxWords}::${text.trim()}`
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
  options: {
    systemPrompt?: string
    signal?: AbortSignal
    model?: string
    temperature?: number
    logLabel?: string
  } = {}
): Promise<string | null> {
  return callMoonshotClient({
    messages,
    systemPrompt: options.systemPrompt,
    model: options.model || MOONSHOT_TRANSLATION_MODEL,
    temperature: options.temperature ?? MOONSHOT_TRANSLATION_TEMPERATURE,
    apiKey: MOONSHOT_API_KEY,
    apiBase: MOONSHOT_API_BASE,
    logLabel: options.logLabel || 'Moonshot 翻译',
    signal: options.signal,
  })
}

function cleanupMoonshotTranslationText(raw: string) {
  const cleaned = raw
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim()

  if (!cleaned) return ''

  return cleaned
    .replace(/^(translatedtext|translation|译文|翻译结果)\s*[:：]\s*/i, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()
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
    const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0)
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
  targetLang: string,
  signal?: AbortSignal
): Promise<string | null> {
  const systemPrompt = '你是 Linswift 的翻译引擎。只输出最终译文，不要解释，不要备注，不要 JSON，不要 markdown，不要引号。'
  const prompt = [
    `把下面这段${sourceLang}内容翻译成${targetLang}。`,
    '要求：',
    '- 译文要自然、地道，并结合上下文',
    '- 保留数字、专有名词、时间、语气和句子重点',
    '- 如果原文已经是目标语言，直接输出原文',
    '',
    text,
  ].join('\n')

  const raw = await callMoonshot(
    [{ role: 'user', content: prompt }],
    {
      systemPrompt,
      signal,
      model: MOONSHOT_TRANSLATION_MODEL,
      temperature: MOONSHOT_TRANSLATION_TEMPERATURE,
      logLabel: `Moonshot 翻译 (${MOONSHOT_TRANSLATION_MODEL})`,
    }
  )
  if (!raw) return null

  const parsed = parseJSON<MoonshotTranslationPayload>(raw)
  if (parsed?.translatedText?.trim()) return parsed.translatedText.trim()

  const cleaned = cleanupMoonshotTranslationText(raw)
  if (cleaned) return cleaned
  return null
}

async function analyzeVocabularyText(
  analysisText: string,
  maxWords: number = 5
): Promise<VocabularyAnalysisResult> {
  const trimmedText = analysisText.trim()
  if (!trimmedText) {
    return { words: [], provider: 'none' }
  }

  const cacheKey = buildVocabularyCacheKey(trimmedText, maxWords)
  const cached = vocabularyCache.get(cacheKey)
  if (cached) return cached

  const inflight = vocabularyInflight.get(cacheKey)
  if (inflight) return inflight

  const task = (async () => {
    try {
      const words = await analyzeUnfamiliarWords(trimmedText, maxWords)
      const result: VocabularyAnalysisResult = {
        words,
        provider: MOONSHOT_API_KEY ? 'moonshot' : 'fallback',
      }
      vocabularyCache.set(cacheKey, result)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const result: VocabularyAnalysisResult = {
        words: [],
        provider: 'fallback',
        note: `陌生词分析失败，已跳过：${message}`,
      }
      vocabularyCache.set(cacheKey, result)
      return result
    } finally {
      vocabularyInflight.delete(cacheKey)
    }
  })()

  vocabularyInflight.set(cacheKey, task)
  return task
}

export async function loadTranslationVocabulary(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string
): Promise<Pick<TranslateResult, 'unfamiliarWords' | 'vocabularyProvider' | 'notes'>> {
  const analysisText = resolveWordAnalysisText(sourceText, translatedText, sourceLang, targetLang)
  if (!analysisText.trim()) {
    return {
      unfamiliarWords: [],
      vocabularyProvider: 'none',
      notes: [],
    }
  }

  const analysis = await analyzeVocabularyText(analysisText, 5)
  return {
    unfamiliarWords: analysis.words,
    vocabularyProvider: analysis.provider,
    notes: analysis.note ? [analysis.note] : [],
  }
}

async function translateWithDeepL(
  text: string,
  sourceLang: string,
  targetLang: string,
  signal?: AbortSignal
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
    signal,
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

async function translateViaAIOnlyFlow(
  text: string,
  sourceLang: string,
  targetLang: string,
  notes: string[] = [],
  signal?: AbortSignal
): Promise<TranslationCoreResult> {
  const translatedText = await translateWithAIOnly(text, sourceLang, targetLang, signal)
  return {
    translatedText: translatedText || fallbackTranslate(text, targetLang),
    translationProvider: translatedText ? 'moonshot' : 'fallback',
    notes: dedupeNotes(notes),
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

async function translateCore(
  text: string,
  sourceLang: string,
  targetLang: string,
  mode: TranslationMode,
  signal?: AbortSignal
): Promise<TranslationCoreResult> {
  const cacheKey = buildTranslationCacheKey(mode, text, sourceLang, targetLang)
  const cached = translationCache.get(cacheKey)
  if (cached) return cached

  const inflight = translationInflight.get(cacheKey)
  if (inflight) return inflight

  const task = (async () => {
    try {
      if (mode === 'ai') {
        const result = await translateViaAIOnlyFlow(text, sourceLang, targetLang, [], signal)
        translationCache.set(cacheKey, result)
        return result
      }

      try {
        const deeplResult = await translateWithDeepL(text, sourceLang, targetLang, signal)
        const result: TranslationCoreResult = {
          translatedText: deeplResult.translatedText,
          translationProvider: 'deepl',
          notes: [],
        }
        translationCache.set(cacheKey, result)
        return result
      } catch (error) {
        if (isAbortError(error)) throw error
        const message = error instanceof Error ? error.message : String(error)
        const result = await translateViaAIOnlyFlow(
          text,
          sourceLang,
          targetLang,
          [`DeepL 暂不可用，已回退到 AI：${message}`],
          signal
        )
        translationCache.set(cacheKey, result)
        return result
      }
    } finally {
      translationInflight.delete(cacheKey)
    }
  })()

  translationInflight.set(cacheKey, task)
  return task
}

export async function translateTextFast(
  text: string,
  sourceLang: string = '中文',
  targetLang: string = 'English',
  mode: TranslationMode = 'hybrid',
  signal?: AbortSignal
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

  const core = await translateCore(safeText, sourceLang, targetLang, mode, signal)
  const vocabularyProvider: VocabularyProvider = mode === 'deepl' || !shouldAnalyzeVocabulary(sourceLang, targetLang)
    ? 'none'
    : 'loading'

  return {
    translatedText: core.translatedText,
    unfamiliarWords: [],
    mode,
    translationProvider: core.translationProvider,
    vocabularyProvider,
    notes: core.notes,
  }
}

export async function translateText(
  text: string,
  sourceLang: string = '中文',
  targetLang: string = 'English',
  mode: TranslationMode = 'hybrid',
  signal?: AbortSignal
): Promise<TranslateResult> {
  const baseResult = await translateTextFast(text, sourceLang, targetLang, mode, signal)
  if (baseResult.vocabularyProvider !== 'loading') return baseResult

  const vocabularyResult = await loadTranslationVocabulary(
    text.trim(),
    baseResult.translatedText,
    sourceLang,
    targetLang
  )

  return {
    ...baseResult,
    unfamiliarWords: vocabularyResult.unfamiliarWords,
    vocabularyProvider: vocabularyResult.vocabularyProvider,
    notes: dedupeNotes([...baseResult.notes, ...vocabularyResult.notes]),
  }
}
