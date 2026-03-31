import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ArrowLeftRight, Star, Volume2, Copy, X, Sparkles, Loader2, Check, Plus, Info,
} from 'lucide-react'
import {
  type TranslationMode,
  translateTextFast,
  loadTranslationVocabulary,
  type TranslateResult,
  type UnfamiliarWord,
} from '../services/translation'
import { getWordDetail, type WordDetail } from '../services/gemini'
import { useVocabulary } from '../hooks/useVocabulary'
import { useTranslations } from '../hooks/useTranslations'
import { useStudyRecords } from '../hooks/useStudyRecords'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { findPreferredVoiceByLang, speakEnglish, speakChinese, speakJapanese } from '../lib/tts'
import { normalizeLookupKey } from '../lib/text'
import { hasLatinText, normalizeWhitespace, shouldShowPhonetic } from '../lib/text'
import DesktopScreenshotTranslator from '../components/translate/DesktopScreenshotTranslator'

const LANGUAGE_OPTIONS = [
  { value: '简体中文', code: 'zh-CN', shortLabel: '简中' },
  { value: 'English', code: 'en', shortLabel: 'English' },
  { value: '日本語', code: 'ja', shortLabel: '日本語' },
] as const

const TRANSLATION_MODE_OPTIONS: Array<{
  value: TranslationMode
  label: string
  description: string
}> = [
  {
    value: 'hybrid',
    label: '混合',
    description: 'DeepL 出主译文，AI 负责陌生词分析',
  },
  {
    value: 'deepl',
    label: 'DeepL',
    description: '只保留机器翻译结果，追求稳定速度',
  },
  {
    value: 'ai',
    label: 'AI',
    description: '只使用 AI 翻译与提词，表达更灵活',
  },
]

const TRANSLATION_PROVIDER_LABELS = {
  deepl: 'DeepL',
  moonshot: 'AI',
  fallback: '离线回退',
} as const

const VOCABULARY_PROVIDER_LABELS = {
  moonshot: 'AI',
  fallback: '离线回退',
  none: '未启用',
  loading: '分析中',
} as const

const AUTO_TRANSLATE_DEBOUNCE_SHORT_MS = 160
const AUTO_TRANSLATE_DEBOUNCE_LONG_MS = 280

type AppTranslateLanguage = (typeof LANGUAGE_OPTIONS)[number]['value']
type AppTranslateLanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code']

type AutocompleteSuggestion = {
  key: string
  text: string
  subtitle: string
  badge: string
  score: number
}

type DictionaryTab = 'summary' | 'phrases' | 'examples' | 'encyclopedia'

const LANG_CODE_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.value, option.code])
) as Record<AppTranslateLanguage, AppTranslateLanguageCode>

const LANG_FROM_CODE_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.code, option.value])
) as Record<AppTranslateLanguageCode, AppTranslateLanguage>

const KANA_RE = /[\u3040-\u30ff]/g
const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g
const LATIN_RE = /[A-Za-z]/g

const LATIN_LANGUAGE_HINTS: Array<{
  language: AppTranslateLanguage
  pattern: RegExp
  weight: number
}> = [
  { language: 'English', pattern: /\b(the|and|is|are|with|for|this|that|hello|thanks|you)\b/gi, weight: 1 },
]

const AUTO_TARGET_FALLBACK_MAP: Record<AppTranslateLanguage, AppTranslateLanguage> = {
  English: '简体中文',
  简体中文: 'English',
  日本語: 'English',
}

function normalizeLanguageCode(languageCode: string) {
  const value = String(languageCode || '').trim().toLowerCase()
  if (!value) return 'en'
  if (value === 'zh' || value === 'zh-cn' || value === 'zh-hans') return 'zh-CN'
  if (value === 'ja' || value === 'ja-jp') return 'ja'
  if (value === 'en' || value.startsWith('en-')) return 'en'
  return languageCode
}

function resolveLanguageValueFromCode(code: string, fallback: AppTranslateLanguage) {
  const normalizedCode = normalizeLanguageCode(code) as AppTranslateLanguageCode
  return LANG_FROM_CODE_MAP[normalizedCode] || fallback
}

function normalizeCollectKey(value: string, languageCode: string) {
  return `${normalizeLanguageCode(languageCode)}::${normalizeLookupKey(value)}`
}

function countMatches(text: string, pattern: RegExp) {
  return text.match(pattern)?.length || 0
}

function detectLatinLanguage(text: string): AppTranslateLanguage | null {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return null

  const scoreMap = new Map<AppTranslateLanguage, number>()

  const addScore = (language: AppTranslateLanguage, score: number) => {
    scoreMap.set(language, (scoreMap.get(language) || 0) + score)
  }

  LATIN_LANGUAGE_HINTS.forEach(({ language, pattern, weight }) => {
    const matched = countMatches(normalized, pattern)
    if (matched > 0) addScore(language, matched * weight)
  })

  const ranked = Array.from(scoreMap.entries()).sort((left, right) => right[1] - left[1])
  const [best, second] = ranked
  if (!best) return 'English'
  if (!second) return best[0]
  if (best[1] - second[1] < 2) return 'English'
  return best[0]
}

function detectInputLanguage(text: string): AppTranslateLanguage | null {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return null

  const kanaCount = countMatches(normalized, KANA_RE)
  const hanCount = countMatches(normalized, HAN_RE)
  const latinCount = countMatches(normalized, LATIN_RE)

  if (kanaCount > 0) return '日本語'

  if (hanCount > 0 && hanCount >= latinCount) {
    return '简体中文'
  }

  if (latinCount > 0) return detectLatinLanguage(normalized)
  return null
}

function resolveNextTargetLanguage(
  detectedSource: AppTranslateLanguage,
  currentSource: AppTranslateLanguage,
  currentTarget: AppTranslateLanguage
) {
  if (currentTarget !== detectedSource) return currentTarget
  if (currentSource !== detectedSource) return currentSource
  return AUTO_TARGET_FALLBACK_MAP[detectedSource]
}

function rankSuggestion(text: string, query: string, order: number, sourceWeight: number) {
  const normalizedText = normalizeLookupKey(text)
  const normalizedQuery = normalizeLookupKey(query)

  if (!normalizedQuery) return sourceWeight - order
  if (normalizedText === normalizedQuery) return 420 - order + sourceWeight
  if (normalizedText.startsWith(normalizedQuery)) return 320 - order + sourceWeight
  if (normalizedText.includes(normalizedQuery)) return 220 - order + sourceWeight

  const tokenMatched = normalizedText
    .split(/[\s,.;:!?()[\]{}"'，。！？；：、]+/)
    .some((token) => token.startsWith(normalizedQuery))
  if (tokenMatched) return 180 - order + sourceWeight

  return -1
}

function resolveSuggestionText(text: string) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

function speakGeneric(text: string, languageCode: string) {
  if (!('speechSynthesis' in window)) return
  const safeText = text.trim()
  if (!safeText) return

  const utterance = new SpeechSynthesisUtterance(safeText)
  utterance.lang = languageCode

  const preferredVoice = findPreferredVoiceByLang(languageCode)
  if (preferredVoice) utterance.voice = preferredVoice

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function isDictionaryLikeQuery(text: string) {
  const normalized = normalizeWhitespace(text)
  if (!normalized || normalized.length > 48) return false
  if (!hasLatinText(normalized)) return false
  return normalized.split(/\s+/).length <= 3
}

function splitMeanings(text: string) {
  return String(text || '')
    .split(/[；;。]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildFallbackPartBlocks(detail: WordDetail) {
  const meanings = splitMeanings(detail.meaning)
  if (meanings.length === 0) {
    return [{ partOfSpeech: '释义', meanings: ['暂无释义'] }]
  }
  return [{ partOfSpeech: '释义', meanings }]
}

function areBooleanMapsEqual(
  left: Record<string, boolean>,
  right: Record<string, boolean>
) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

export default function TranslatePage() {
  const { vocabulary, addWord, addWords } = useVocabulary()
  const {
    history,
    fetchHistory,
    saveTranslation,
    toggleStar,
  } = useTranslations()
  const { appendStudy } = useStudyRecords()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [inputText, setInputText] = useState('')
  const [sourceLang, setSourceLang] = useState<AppTranslateLanguage>('简体中文')
  const [targetLang, setTargetLang] = useState<AppTranslateLanguage>('English')
  const [translationMode, setTranslationMode] = useState<TranslationMode>(() => {
    const savedMode = localStorage.getItem('linswift.translate.mode')
    return savedMode === 'ai' || savedMode === 'deepl' || savedMode === 'hybrid'
      ? savedMode
      : 'ai'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)
  const [currentTranslationId, setCurrentTranslationId] = useState<number | null>(null)
  const [collectedWordSet, setCollectedWordSet] = useState<Record<string, boolean>>({})
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [dictionaryDetail, setDictionaryDetail] = useState<WordDetail | null>(null)
  const [dictionaryQuery, setDictionaryQuery] = useState('')
  const [dictionaryLoading, setDictionaryLoading] = useState(false)
  const [dictionaryError, setDictionaryError] = useState<string | null>(null)
  const [activeDictionaryTab, setActiveDictionaryTab] = useState<DictionaryTab>('summary')
  const [isComposing, setIsComposing] = useState(false)
  const [modeHintOpen, setModeHintOpen] = useState<TranslationMode | null>(null)
  const modeHintPanelRef = useRef<HTMLDivElement | null>(null)
  const modeHintCloseTimerRef = useRef<number | null>(null)
  const translationRequestRef = useRef(0)
  const activeTranslateKeyRef = useRef('')
  const completedTranslateKeyRef = useRef('')
  const activeTranslateAbortRef = useRef<AbortController | null>(null)

  const clearModeHintCloseTimer = useCallback(() => {
    if (modeHintCloseTimerRef.current !== null) {
      window.clearTimeout(modeHintCloseTimerRef.current)
      modeHintCloseTimerRef.current = null
    }
  }, [])

  const scheduleModeHintClose = useCallback(() => {
    clearModeHintCloseTimer()
    modeHintCloseTimerRef.current = window.setTimeout(() => {
      setModeHintOpen(null)
      modeHintCloseTimerRef.current = null
    }, 120)
  }, [clearModeHintCloseTimer])

  const syncLanguagePairWithInput = useCallback((text: string) => {
    const detectedSource = detectInputLanguage(text)
    if (!detectedSource) {
      return {
        sourceLang,
        targetLang,
      }
    }

    const nextSourceLang = detectedSource
    const nextTargetLang = resolveNextTargetLanguage(detectedSource, sourceLang, targetLang)

    if (nextSourceLang !== sourceLang) setSourceLang(nextSourceLang)
    if (nextTargetLang !== targetLang) setTargetLang(nextTargetLang)

    return {
      sourceLang: nextSourceLang,
      targetLang: nextTargetLang,
    }
  }, [sourceLang, targetLang])

  useEffect(() => { fetchHistory(20) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('linswift.translate.mode', translationMode)
  }, [translationMode])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (isDesktop) return
      const target = event.target
      if (!(target instanceof Node)) return
      if (modeHintPanelRef.current?.contains(target)) return
      setModeHintOpen(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [isDesktop])

  useEffect(() => (
    () => {
      clearModeHintCloseTimer()
    }
  ), [clearModeHintCloseTimer])

  const currentHistoryItem = useMemo(
    () => history.find(item => item.id === currentTranslationId) || null,
    [history, currentTranslationId]
  )

  const autocompleteSuggestions = useMemo(() => {
    const query = resolveSuggestionText(inputText)
    const uniqueSuggestions = new Map<string, AutocompleteSuggestion>()

    const pushSuggestion = (
      text: string,
      subtitle: string,
      badge: string,
      order: number,
      sourceWeight: number
    ) => {
      const safeText = resolveSuggestionText(text)
      if (!safeText) return

      const score = rankSuggestion(safeText, query, order, sourceWeight)
      if (score < 0) return

      const key = normalizeLookupKey(safeText)
      const current = uniqueSuggestions.get(key)
      if (!current || score > current.score) {
        uniqueSuggestions.set(key, {
          key,
          text: safeText,
          subtitle,
          badge,
          score,
        })
      }
    }

    history.forEach((item, index) => {
      pushSuggestion(item.source_text, '最近输入', '历史', index, 140)
      pushSuggestion(item.translated_text, '最近翻译结果', '结果', index, 90)
    })

    vocabulary.forEach((item, index) => {
      pushSuggestion(
        item.word,
        item.meaning || item.language_label || '词库词条',
        item.language_label || '词库',
        index,
        item.starred ? 130 : 100
      )
    })

    return Array.from(uniqueSuggestions.values())
      .sort((left, right) => right.score - left.score || left.text.length - right.text.length)
      .slice(0, 5)
  }, [history, inputText, vocabulary])

  const dictionaryLookupQuery = useMemo(() => {
    const trimmedInput = normalizeWhitespace(inputText)
    if (isDictionaryLikeQuery(trimmedInput) && detectInputLanguage(trimmedInput) === 'English') {
      return trimmedInput
    }

    if (!result) return ''

    const translated = normalizeWhitespace(result?.translatedText || '')
    if (targetLang === 'English' && isDictionaryLikeQuery(translated)) return translated

    return ''
  }, [inputText, result, result?.translatedText, targetLang])

  const dictionarySuggestionPool = useMemo(() => {
    const unique = new Map<string, { word: string; meaning: string }>()

    autocompleteSuggestions.forEach((item) => {
      const key = normalizeLookupKey(item.text)
      if (!unique.has(key)) {
        unique.set(key, { word: item.text, meaning: item.subtitle })
      }
    })

    dictionaryDetail?.relatedWords?.forEach((item) => {
      const word = normalizeWhitespace(item.word)
      if (!word) return
      const key = normalizeLookupKey(word)
      if (!unique.has(key)) {
        unique.set(key, { word, meaning: item.meaning || '相关词' })
      }
    })

    return Array.from(unique.values())
      .filter((item) => isDictionaryLikeQuery(item.word))
      .filter((item) => normalizeLookupKey(item.word) !== normalizeLookupKey(dictionaryLookupQuery))
      .slice(0, 6)
  }, [autocompleteSuggestions, dictionaryDetail?.relatedWords, dictionaryLookupQuery])

  const isSingleWordDictionaryQuery = useMemo(() => {
    const normalizedQuery = normalizeWhitespace(dictionaryLookupQuery || dictionaryQuery)
    if (!normalizedQuery) return false
    return normalizedQuery.split(/\s+/).length === 1
  }, [dictionaryLookupQuery, dictionaryQuery])

  const isCurrentStarred = !!currentHistoryItem?.is_starred

  const isVocabularyCollected = useCallback((value: string, languageCode: string) => {
    const targetKey = normalizeCollectKey(value, languageCode)
    return vocabulary.some((item) => (
      normalizeCollectKey(item.word, item.language_code || 'en') === targetKey
    ))
  }, [vocabulary])

  useEffect(() => {
    if (!result) {
      setCollectedWordSet((current) => (Object.keys(current).length === 0 ? current : {}))
      return
    }

    const nextCollectedWordSet = result.unfamiliarWords.reduce<Record<string, boolean>>((acc, word) => {
        const collectKey = normalizeCollectKey(word.word, 'en')
        if (isVocabularyCollected(word.word, 'en')) {
          acc[collectKey] = true
        }
        return acc
      }, {})

    setCollectedWordSet((current) => (
      areBooleanMapsEqual(current, nextCollectedWordSet) ? current : nextCollectedWordSet
    ))
  }, [isVocabularyCollected, result])

  useEffect(() => {
    if (!dictionaryLookupQuery) {
      setDictionaryQuery('')
      setDictionaryDetail(null)
      setDictionaryError(null)
      setDictionaryLoading(false)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setDictionaryLoading(true)
      setDictionaryError(null)
      setDictionaryQuery(dictionaryLookupQuery)
      setActiveDictionaryTab('summary')

      getWordDetail(dictionaryLookupQuery)
        .then((detail) => {
          if (cancelled) return
          setDictionaryDetail(detail)
        })
        .catch((err) => {
          if (cancelled) return
          setDictionaryDetail(null)
          setDictionaryError(err instanceof Error ? err.message : '词条详情加载失败')
        })
        .finally(() => {
          if (cancelled) return
          setDictionaryLoading(false)
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dictionaryLookupQuery])

  const swapLanguages = () => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    if (result) {
      setInputText(result.translatedText)
      setResult(null)
    }
  }

  const speakByLanguage = useCallback((text: string, lang: AppTranslateLanguage) => {
    if (!text.trim()) return

    const languageCode = LANG_CODE_MAP[lang]
    if (languageCode.startsWith('zh')) {
      speakChinese(text)
      return
    }
    if (languageCode === 'ja') {
      speakJapanese(text)
      return
    }
    if (languageCode === 'en') {
      speakEnglish(text)
      return
    }

    speakGeneric(text, languageCode)
  }, [])

  const handleTranslate = useCallback(async () => {
    const safeInput = inputText.trim()
    if (!safeInput) return

    const {
      sourceLang: effectiveSourceLang,
      targetLang: effectiveTargetLang,
    } = syncLanguagePairWithInput(safeInput)
    const translateKey = [
      translationMode,
      effectiveSourceLang,
      effectiveTargetLang,
      safeInput,
    ].join('::')

    if (activeTranslateKeyRef.current === translateKey) return
    if (completedTranslateKeyRef.current === translateKey) return

    const requestId = translationRequestRef.current + 1
    translationRequestRef.current = requestId
    activeTranslateKeyRef.current = translateKey
    activeTranslateAbortRef.current?.abort()
    const abortController = new AbortController()
    activeTranslateAbortRef.current = abortController

    setIsLoading(true)
    setError(null)
    setCurrentTranslationId(null)

    try {
      const translateResult = await translateTextFast(
        safeInput,
        effectiveSourceLang,
        effectiveTargetLang,
        translationMode,
        abortController.signal
      )
      if (translationRequestRef.current !== requestId) return

      setResult(translateResult)
      setIsLoading(false)
      activeTranslateKeyRef.current = ''
      completedTranslateKeyRef.current = translateKey

      void saveTranslation({
        source_text: safeInput,
        translated_text: translateResult.translatedText,
        source_lang: LANG_CODE_MAP[effectiveSourceLang],
        target_lang: LANG_CODE_MAP[effectiveTargetLang],
        unfamiliar_words: [],
      })
        .then(({ data, error: saveError }) => {
          if (saveError) {
            console.warn('翻译历史保存失败:', saveError)
            return
          }
          if (translationRequestRef.current === requestId) {
            setCurrentTranslationId(data?.id ?? null)
          }
        })
        .catch((saveError) => {
          console.warn('翻译历史保存失败:', saveError)
        })

      void appendStudy({ study_duration: 1 }).catch((studyError) => {
        console.warn('学习记录写入失败:', studyError)
      })

      if (translateResult.vocabularyProvider === 'loading') {
        const vocabularyPromise = loadTranslationVocabulary(
          safeInput,
          translateResult.translatedText,
          effectiveSourceLang,
          effectiveTargetLang
        )

        void vocabularyPromise
          .then((vocabularyResult) => {
            if (translationRequestRef.current !== requestId) return

            setResult((current) => {
              if (!current) return current
              return {
                ...current,
                unfamiliarWords: vocabularyResult.unfamiliarWords,
                vocabularyProvider: vocabularyResult.vocabularyProvider,
                notes: Array.from(new Set([...current.notes, ...vocabularyResult.notes])),
              }
            })
          })
          .catch((vocabularyError) => {
            if (translationRequestRef.current !== requestId) return
            const note = vocabularyError instanceof Error
              ? `陌生词分析失败，已跳过：${vocabularyError.message}`
              : '陌生词分析失败，已跳过'

            setResult((current) => {
              if (!current) return current
              return {
                ...current,
                vocabularyProvider: 'fallback',
                notes: Array.from(new Set([...current.notes, note])),
              }
            })
          })
      }
    } catch (err) {
      if (translationRequestRef.current !== requestId) return
      if (err instanceof Error && err.name === 'AbortError') return
      activeTranslateKeyRef.current = ''
      setError(err instanceof Error ? err.message : '翻译失败')
      setIsLoading(false)
    } finally {
      if (activeTranslateAbortRef.current === abortController) {
        activeTranslateAbortRef.current = null
      }
    }
  }, [appendStudy, inputText, saveTranslation, syncLanguagePairWithInput, translationMode])

  useEffect(() => {
    if (isComposing) return

    const safeInput = inputText.trim()
    if (!safeInput) {
      translationRequestRef.current += 1
      activeTranslateAbortRef.current?.abort()
      activeTranslateAbortRef.current = null
      activeTranslateKeyRef.current = ''
      completedTranslateKeyRef.current = ''
      setIsLoading(false)
      setError(null)
      setResult(null)
      setCurrentTranslationId(null)
      return
    }

    const debounceMs = safeInput.length <= 16
      ? AUTO_TRANSLATE_DEBOUNCE_SHORT_MS
      : AUTO_TRANSLATE_DEBOUNCE_LONG_MS

    const timer = window.setTimeout(() => {
      void handleTranslate()
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [handleTranslate, inputText, isComposing, sourceLang, targetLang, translationMode])

  useEffect(() => (
    () => {
      activeTranslateAbortRef.current?.abort()
    }
  ), [])

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.translatedText)
      setCopiedText(true)
      setTimeout(() => setCopiedText(false), 2000)
    } catch {
      console.warn('复制失败')
    }
  }

  const translateButtonLabel = isLoading ? '翻译中…' : '翻译'

  const renderHighlightedText = (text: string, words: UnfamiliarWord[]) => {
    if (words.length === 0) return <span>{text}</span>

    const pattern = new RegExp(
      `\\b(${words.map(w => w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
      'gi'
    )

    const parts = text.split(pattern)

    return parts.map((part, i) => {
      const matchedWord = words.find(
        w => normalizeLookupKey(w.word) === normalizeLookupKey(part)
      )

      if (matchedWord) {
        return (
          <span
            key={i}
            className="cursor-pointer text-[var(--color-primary)] underline decoration-dashed underline-offset-4"
            title={`${matchedWord.phonetic || ''} ${matchedWord.meaning}`}
          >
            {part}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  const dictionaryPartBlocks = dictionaryDetail?.partOfSpeechBlocks?.length
    ? dictionaryDetail.partOfSpeechBlocks
    : dictionaryDetail
      ? buildFallbackPartBlocks(dictionaryDetail)
      : []

  const dictionaryCollectedKey = dictionaryQuery
    ? normalizeCollectKey(dictionaryQuery, 'en')
    : null

  const isDictionaryCollected = dictionaryCollectedKey
    ? !!vocabulary.find((item) => normalizeCollectKey(item.word, item.language_code || 'en') === dictionaryCollectedKey)
    : false

  const dictionarySummaryPreview = dictionaryPartBlocks
    .flatMap((block) => block.meanings)
    .slice(0, 3)

  const isFallbackDictionary = useMemo(() => {
    const summary = `${dictionaryDetail?.meaning || ''} ${dictionaryDetail?.mnemonic || ''}`
    return summary.includes('AI 暂时不可用') || summary.includes('AI 离线')
  }, [dictionaryDetail?.meaning, dictionaryDetail?.mnemonic])

  const dictionaryTabItems: Array<{
    key: DictionaryTab
    label: string
    count: number | null
  }> = [
    { key: 'summary', label: '简明', count: dictionaryPartBlocks.length || null },
    { key: 'phrases', label: '词组', count: dictionaryDetail?.phrasePatterns?.length || 0 },
    { key: 'examples', label: '例句', count: dictionaryDetail?.examples?.length || 0 },
    {
      key: 'encyclopedia',
      label: '百科',
      count: (dictionaryDetail?.encyclopedia?.length || 0) + (dictionaryDetail?.relatedWords?.length || 0),
    },
  ]

  const handleCollectDictionaryWord = useCallback(async () => {
    if (!dictionaryDetail?.word.trim()) return

    const { error: saveError } = await addWord({
      word: dictionaryDetail.word,
      language_code: 'en',
      language_label: 'English',
      phonetic: dictionaryDetail.phoneticAm || dictionaryDetail.phoneticBr || dictionaryDetail.phonetic,
      meaning: dictionaryPartBlocks
        .flatMap((block) => block.meanings)
        .slice(0, 4)
        .join('；') || dictionaryDetail.meaning,
      example_sentence: dictionaryDetail.examples[0] || undefined,
      source: 'translate',
    })

    if (!saveError) {
      await appendStudy({
        vocabulary_learned: 1,
        study_duration: 1,
      })
    }
  }, [addWord, appendStudy, dictionaryDetail, dictionaryPartBlocks])

  const translationResultCard = result ? (
    <div
      className="mx-5 mb-3 rounded-[var(--radius-md)] bg-[var(--color-card)] p-4"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <span className="block text-[12px] text-[var(--color-muted)]">
            翻译结果
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--color-muted-light)]">
            主翻译：{TRANSLATION_PROVIDER_LABELS[result.translationProvider]} · 生词分析：{VOCABULARY_PROVIDER_LABELS[result.vocabularyProvider]}
          </span>
        </div>
        <button
          className="rounded-full bg-[var(--color-background-secondary)] p-1.5"
          onClick={() => speakByLanguage(result.translatedText, targetLang)}
          title="播放翻译结果"
        >
          <Volume2 size={16} className="text-[var(--color-muted)]" />
        </button>
      </div>
      <p className="leading-relaxed text-[15px] text-[var(--color-foreground)]">
        {renderHighlightedText(result.translatedText, result.unfamiliarWords)}
      </p>

      {result.notes.length > 0 && (
        <div className="mt-3 space-y-2 rounded-[16px] bg-[var(--color-background-secondary)] p-3">
          {result.notes.map((note, index) => (
            <p key={`${note}-${index}`} className="text-[12px] leading-relaxed text-[var(--color-muted)]">
              {note}
            </p>
          ))}
        </div>
      )}

      {result.unfamiliarWords.length > 0 && !isSingleWordDictionaryQuery && (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <p className="mb-2 text-[12px] text-[var(--color-muted)]">
            识别到 {result.unfamiliarWords.length} 个值得学习的词汇：
          </p>
          <div className="flex flex-wrap gap-2">
            {result.unfamiliarWords.map((w, i) => {
              const collectKey = normalizeCollectKey(w.word, 'en')
              const hasCollected = collectedWordSet[collectKey]

              return (
                <button
                  key={`${w.word}-${i}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    hasCollected
                      ? 'border-[var(--color-success)]/20 bg-[var(--color-success)]/10'
                      : 'border-transparent bg-[var(--color-primary-light)]'
                  }`}
                  title={w.phonetic}
                  onClick={async () => {
                    if (hasCollected) return
                    const { error: saveError } = await addWord({
                      word: w.word,
                      language_code: 'en',
                      language_label: 'English',
                      phonetic: w.phonetic,
                      meaning: w.meaning,
                      source: 'translate',
                    })
                    if (!saveError) {
                      setCollectedWordSet((prev) => ({ ...prev, [collectKey]: true }))
                      await appendStudy({
                        vocabulary_learned: 1,
                        study_duration: 1,
                      })
                    }
                  }}
                >
                  <span className="font-semibold text-[var(--color-primary)]">{w.word}</span>
                  <span className="text-[var(--color-muted)]">{w.meaning}</span>
                  {hasCollected ? (
                    <Check size={14} className="text-[var(--color-success)]" />
                  ) : (
                    <Plus size={14} className="text-[var(--color-primary)]" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {result.unfamiliarWords.length > 0 && !isSingleWordDictionaryQuery && (
        <button
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] px-4 py-2.5 transition-transform active:scale-[0.98]"
          disabled={result.unfamiliarWords.every(word => collectedWordSet[normalizeCollectKey(word.word, 'en')])}
          onClick={async () => {
            const words = result.unfamiliarWords.map(w => ({
              word: w.word,
              language_code: 'en',
              language_label: 'English',
              phonetic: w.phonetic,
              meaning: w.meaning,
              source: 'translate' as const,
            }))
            const { error: saveError } = await addWords(words)
            if (!saveError) {
              setCollectedWordSet(
                result.unfamiliarWords.reduce<Record<string, boolean>>((acc, word) => {
                  acc[normalizeCollectKey(word.word, 'en')] = true
                  return acc
                }, {})
              )
              await appendStudy({
                vocabulary_learned: words.length,
                study_duration: 2,
              })
            }
          }}
        >
          {result.unfamiliarWords.every(word => collectedWordSet[normalizeCollectKey(word.word, 'en')]) ? (
            <>
              <Check size={16} className="text-[var(--color-success)]" />
              <span className="text-[13px] font-semibold text-[var(--color-success)]">
                已收录到词库
              </span>
            </>
          ) : (
            <>
              <Sparkles size={16} className="text-[var(--color-primary)]" />
              <span className="text-[13px] font-semibold text-[var(--color-primary)]">
                一键收录 {result.unfamiliarWords.length} 个陌生词汇
              </span>
            </>
          )}
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-background)] pb-4 md:min-h-[100dvh]">
      <DesktopScreenshotTranslator
        targetLang={targetLang}
        onTargetLangChange={(nextLang) => setTargetLang(nextLang as AppTranslateLanguage)}
        onUseExtractedText={(text) => {
          setInputText(text)
          syncLanguagePairWithInput(text)
          setResult(null)
          setError(null)
        }}
      />

      <div className="mb-4 flex items-center justify-center gap-4 px-5">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value as AppTranslateLanguage)}
          className="flex-1 appearance-none rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] px-3 py-2 text-center text-[14px] font-semibold text-[var(--color-foreground)] outline-none [text-align-last:center]"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.value} value={lang.value}>{lang.value}</option>
          ))}
        </select>
        <button
          onClick={swapLanguages}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] transition-transform active:scale-95"
        >
          <ArrowLeftRight size={16} className="text-[var(--color-primary)]" />
        </button>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value as AppTranslateLanguage)}
          className="flex-1 appearance-none rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] px-3 py-2 text-center text-[14px] font-semibold text-[var(--color-foreground)] outline-none [text-align-last:center]"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.value} value={lang.value}>{lang.value}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 px-5" ref={modeHintPanelRef}>
        <div
          className="rounded-[var(--radius-md)] bg-[var(--color-card)] p-3"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--color-muted)]">翻译模式</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TRANSLATION_MODE_OPTIONS.map((option) => {
              const active = translationMode === option.value
              return (
                <div key={option.value}>
                  <div
                    className={`rounded-[16px] border px-3 py-2 transition-all ${
                      active
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-background-secondary)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTranslationMode(option.value)
                          setModeHintOpen(null)
                        }}
                        className="min-w-0 flex-1 text-left active:scale-[0.98]"
                      >
                        <span className={`block text-[13px] font-semibold ${
                          active ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
                        }`}
                        >
                          {option.label}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          active
                            ? 'border-[var(--color-primary)]/30 bg-white/85 text-[var(--color-primary)]'
                            : 'border-[var(--color-border)] bg-white/80 text-[var(--color-muted)]'
                        }`}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          clearModeHintCloseTimer()
                          setModeHintOpen((current) => current === option.value ? null : option.value)
                        }}
                        onPointerEnter={(event) => {
                          if (isDesktop && event.pointerType === 'mouse') {
                            clearModeHintCloseTimer()
                            setModeHintOpen(option.value)
                          }
                        }}
                        onPointerLeave={(event) => {
                          if (isDesktop && event.pointerType === 'mouse') {
                            scheduleModeHintClose()
                          }
                        }}
                        aria-label={`${option.label}说明`}
                      >
                        <Info size={12} />
                      </button>
                    </div>
                  </div>

                </div>
              )
            })}
          </div>
          {modeHintOpen && (
            <div
              className="mt-2 rounded-[12px] bg-[var(--color-background-secondary)] px-3 py-2 text-[11px] leading-5 text-[var(--color-muted)]"
              onPointerEnter={(event) => {
                if (isDesktop && event.pointerType === 'mouse') {
                  clearModeHintCloseTimer()
                }
              }}
              onPointerLeave={(event) => {
                if (isDesktop && event.pointerType === 'mouse') {
                  scheduleModeHintClose()
                }
              }}
            >
              {TRANSLATION_MODE_OPTIONS.find((option) => option.value === modeHintOpen)?.description}
            </div>
          )}
        </div>
      </div>

      <div
        className="mx-5 mb-3 rounded-[var(--radius-md)] bg-[var(--color-card)] p-4"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="mb-2 flex items-start justify-between">
          <span className="text-[12px] text-[var(--color-muted)]">输入文本</span>
          {inputText && (
            <button onClick={() => { setInputText(''); setResult(null); setError(null) }}>
              <X size={16} className="text-[var(--color-muted)]" />
            </button>
          )}
        </div>
        <textarea
          value={inputText}
          onChange={(e) => {
            const nextValue = e.target.value
            setInputText(nextValue)
            syncLanguagePairWithInput(nextValue)
          }}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => window.setTimeout(() => setIsInputFocused(false), 120)}
          placeholder="输入要翻译的文本..."
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          className="h-[100px] w-full resize-none bg-transparent text-[15px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-light)]"
        />

        {isInputFocused && autocompleteSuggestions.length > 0 && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--color-muted)]">
                智能补全建议
              </span>
              <span className="text-[11px] text-[var(--color-muted-light)]">
                最多 5 条
              </span>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
              {autocompleteSuggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setInputText(suggestion.text)
                    syncLanguagePairWithInput(suggestion.text)
                    setResult(null)
                    setError(null)
                    setIsInputFocused(false)
                  }}
                  className="flex w-full items-center gap-3 border-b border-[var(--color-border)]/70 px-3 py-2.5 text-left transition-colors last:border-b-0 active:bg-white/55"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">
                      {suggestion.text}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                      {suggestion.subtitle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
                    {suggestion.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2">
          <div className="flex items-center gap-3">
            <button className="p-1.5" onClick={() => speakByLanguage(inputText, sourceLang)}>
              <Volume2 size={18} className="text-[var(--color-muted)]" />
            </button>
            <button
              className="p-1.5"
              onClick={() => currentTranslationId && toggleStar(currentTranslationId)}
              disabled={!currentTranslationId}
              title={currentTranslationId ? '收藏当前翻译' : '请先翻译后再收藏'}
            >
              <Star
                size={18}
                className={isCurrentStarred ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}
              />
            </button>
            <button className="p-1.5" onClick={handleCopy}>
              <Copy size={18} className={copiedText ? 'text-[var(--color-success)]' : 'text-[var(--color-muted)]'} />
            </button>
          </div>
          <button
            onClick={handleTranslate}
            disabled={isLoading || !inputText.trim()}
            aria-live="polite"
            className="flex h-9 min-w-[104px] items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[13px] font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="shrink-0 animate-spin" />
                <span>{translateButtonLabel}</span>
              </>
            ) : (
              <span>{translateButtonLabel}</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-[var(--radius-sm)] bg-[var(--color-error)]/10 p-3 text-[13px] text-[var(--color-error)]">
          {error}
        </div>
      )}

      {translationResultCard}

      {(dictionaryLookupQuery || dictionaryLoading || dictionaryDetail || dictionaryError) && (
        <div
          className="mx-5 mb-3 rounded-[var(--radius-md)] bg-[var(--color-card)] p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-[var(--color-muted)]">词典结果</p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="truncate text-[28px] font-bold text-[var(--color-foreground)]">
                  {dictionaryQuery || dictionaryLookupQuery}
                </h2>
                {dictionaryLoading && <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />}
              </div>
            </div>
            {!!dictionaryQuery && (
              <button
                className="rounded-full bg-[var(--color-background-secondary)] p-2"
                onClick={() => speakByLanguage(dictionaryQuery, 'English')}
                title="播放单词发音"
              >
                <Volume2 size={16} className="text-[var(--color-muted)]" />
              </button>
            )}
          </div>

          {dictionarySuggestionPool.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
              {dictionarySuggestionPool.map((item) => (
                <button
                  key={item.word}
                  type="button"
                  onClick={() => {
                    setInputText(item.word)
                    setResult(null)
                    setError(null)
                  }}
                  className="flex w-full items-center gap-3 border-b border-[var(--color-border)]/70 px-3 py-3 text-left transition-colors last:border-b-0 active:bg-white/55"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-[var(--color-foreground)]">{item.word}</span>
                  </span>
                  <span className="max-w-[68%] truncate text-[13px] text-[var(--color-muted)]">{item.meaning}</span>
                </button>
              ))}
            </div>
          )}

          {dictionaryError && (
            <p className="mt-4 rounded-[14px] bg-[var(--color-error)]/10 px-3 py-2 text-[12px] text-[var(--color-error)]">
              {dictionaryError}
            </p>
          )}

          {dictionaryDetail && (
            <>
              <div className="mt-4 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--color-primary)]">
                        AI 词典
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[var(--color-muted)]">
                        {dictionaryQuery.split(/\s+/).length > 1 ? '词组查询' : '单词查询'}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[var(--color-muted)]">
                        {dictionaryPartBlocks.length} 个词性
                      </span>
                    </div>
                    <p className="mt-3 text-[15px] leading-7 text-[var(--color-muted)]">
                      {dictionarySummaryPreview.length > 0
                        ? dictionarySummaryPreview.join('；')
                        : dictionaryDetail.meaning}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => speakByLanguage(dictionaryDetail.word, 'English')}
                      className="rounded-full bg-white p-2.5"
                      title="播放单词发音"
                    >
                      <Volume2 size={16} className="text-[var(--color-muted)]" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(dictionaryDetail.word)
                      }}
                      className="rounded-full bg-white p-2.5"
                      title="复制单词"
                    >
                      <Copy size={16} className="text-[var(--color-muted)]" />
                    </button>
                    <button
                      type="button"
                      onClick={handleCollectDictionaryWord}
                      disabled={isDictionaryCollected}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-transform active:scale-[0.98] ${
                        isDictionaryCollected
                          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
                          : 'bg-[var(--color-primary)] text-white'
                      }`}
                    >
                      {isDictionaryCollected ? <Check size={15} /> : <Plus size={15} />}
                      {isDictionaryCollected ? '已加入词库' : '加入词库'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  {shouldShowPhonetic(dictionaryDetail.word, dictionaryDetail.phoneticBr || dictionaryDetail.phonetic) && (
                    <button
                      type="button"
                      onClick={() => speakByLanguage(dictionaryDetail.word, 'English')}
                      className="inline-flex items-center gap-2 text-[13px] text-[var(--color-foreground)]"
                    >
                      <span className="font-semibold">英</span>
                      <span>{dictionaryDetail.phoneticBr || dictionaryDetail.phonetic}</span>
                      <Volume2 size={15} className="text-[var(--color-muted)]" />
                    </button>
                  )}
                  {shouldShowPhonetic(dictionaryDetail.word, dictionaryDetail.phoneticAm || dictionaryDetail.phonetic) && (
                    <button
                      type="button"
                      onClick={() => speakByLanguage(dictionaryDetail.word, 'English')}
                      className="inline-flex items-center gap-2 text-[13px] text-[var(--color-foreground)]"
                    >
                      <span className="font-semibold">美</span>
                      <span>{dictionaryDetail.phoneticAm || dictionaryDetail.phonetic}</span>
                      <Volume2 size={15} className="text-[var(--color-muted)]" />
                    </button>
                  )}
                  <span className="text-[13px] text-[var(--color-muted)]">
                    近义词 {dictionaryDetail.synonyms.length} 个
                  </span>
                  <span className="text-[13px] text-[var(--color-muted)]">
                    例句 {dictionaryDetail.examples.length} 条
                  </span>
                </div>
              </div>

              {isFallbackDictionary ? (
                <div className="mt-4 rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-[var(--color-primary)]" />
                    <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">词典增强暂不可用</h3>
                  </div>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)]">
                    当前先保留基础查词卡片；如果 AI 词典暂时失败，不再用大块占位内容打断翻译流程。你可以先看上方译文，稍后再重试词典增强。
                  </p>
                </div>
              ) : (
              <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-5 overflow-x-auto border-b border-[var(--color-border)] pb-px">
                    {dictionaryTabItems.map((item) => {
                      const active = activeDictionaryTab === item.key
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setActiveDictionaryTab(item.key)}
                          className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-semibold transition-colors ${
                            active
                              ? 'border-[var(--color-primary)] text-[var(--color-foreground)]'
                              : 'border-transparent text-[var(--color-muted)]'
                          }`}
                        >
                          <span>{item.label}</span>
                          {item.count ? (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]' : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'}`}>
                              {item.count}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>

                  {activeDictionaryTab === 'summary' && (
                    <div className="mt-5 space-y-5">
                      <section>
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">核心释义</h3>
                          <span className="text-[11px] text-[var(--color-muted)]">按词性分组</span>
                        </div>
                        <div className="overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)]">
                          {dictionaryPartBlocks.map((block, blockIndex) => (
                            <div
                              key={`${block.partOfSpeech}-${block.meanings.join('-')}`}
                              className={`grid grid-cols-[76px,1fr] gap-3 px-4 py-4 ${blockIndex === dictionaryPartBlocks.length - 1 ? '' : 'border-b border-[var(--color-border)]'}`}
                            >
                              <div className="pt-0.5 text-[14px] italic text-[var(--color-muted)]">
                                {block.partOfSpeech}
                              </div>
                              <div className="space-y-2">
                                {block.meanings.map((meaning, index) => (
                                  <p key={`${block.partOfSpeech}-${index}`} className="text-[15px] leading-7 text-[var(--color-foreground)]">
                                    {index + 1}. {meaning}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">记忆提示</h3>
                          <span className="text-[11px] text-[var(--color-muted)]">AI 辅助</span>
                        </div>
                        <p className="text-[14px] leading-7 text-[var(--color-foreground)]">
                          {dictionaryDetail.mnemonic}
                        </p>
                      </section>
                    </div>
                  )}

                  {activeDictionaryTab === 'phrases' && (
                    <div className="mt-5 space-y-3">
                      {(dictionaryDetail.phrasePatterns && dictionaryDetail.phrasePatterns.length > 0
                        ? dictionaryDetail.phrasePatterns
                        : []).map((item, index) => (
                        <div key={`${item.phrase}-${item.meaning}`} className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                Phrase {index + 1}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setInputText(item.phrase)
                                  setResult(null)
                                  setError(null)
                                }}
                                className="mt-1 text-left text-[16px] font-semibold text-[var(--color-foreground)]"
                              >
                                {item.phrase}
                              </button>
                              <p className="mt-2 text-[14px] leading-7 text-[var(--color-muted)]">{item.meaning}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => speakByLanguage(item.phrase, 'English')}
                              className="rounded-full bg-[var(--color-background-secondary)] p-2"
                            >
                              <Volume2 size={14} className="text-[var(--color-muted)]" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!dictionaryDetail.phrasePatterns || dictionaryDetail.phrasePatterns.length === 0) && (
                        <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-[13px] text-[var(--color-muted)]">
                          当前词条暂未生成固定搭配。
                        </div>
                      )}
                    </div>
                  )}

                  {activeDictionaryTab === 'examples' && (
                    <div className="mt-5 space-y-3">
                      {dictionaryDetail.examples.length > 0 ? (
                        dictionaryDetail.examples.map((example, index) => (
                          <div key={`${example}-${index}`} className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-muted)]">
                                  Example {index + 1}
                                </p>
                                <p className="mt-2 text-[15px] leading-7 text-[var(--color-foreground)]">{example}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => speakByLanguage(example, 'English')}
                                className="rounded-full bg-[var(--color-background-secondary)] p-2"
                              >
                                <Volume2 size={14} className="text-[var(--color-muted)]" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-[13px] text-[var(--color-muted)]">
                          当前词条暂未提供可用例句。
                        </div>
                      )}
                    </div>
                  )}

                  {activeDictionaryTab === 'encyclopedia' && (
                    <div className="mt-5 space-y-5">
                      {dictionaryDetail.synonyms.length > 0 && (
                        <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                          <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-foreground)]">近义词</h3>
                          <div className="flex flex-wrap gap-2">
                            {dictionaryDetail.synonyms.map((synonym) => (
                              <button
                                key={synonym}
                                type="button"
                                onClick={() => {
                                  setInputText(synonym)
                                  setResult(null)
                                  setError(null)
                                }}
                                className="rounded-full bg-[var(--color-primary-light)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-primary)]"
                              >
                                {synonym}
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      {dictionaryDetail.encyclopedia && dictionaryDetail.encyclopedia.length > 0 && (
                        <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                          <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-foreground)]">百科说明</h3>
                          <div className="space-y-3">
                            {dictionaryDetail.encyclopedia.map((item, index) => (
                              <p key={`${item}-${index}`} className="text-[14px] leading-7 text-[var(--color-foreground)]">
                                {index + 1}. {item}
                              </p>
                            ))}
                          </div>
                        </section>
                      )}

                      {dictionaryDetail.relatedWords && dictionaryDetail.relatedWords.length > 0 && (
                        <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                          <h3 className="mb-3 text-[14px] font-semibold text-[var(--color-foreground)]">联想词</h3>
                          <div className="overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
                            {dictionaryDetail.relatedWords.map((item, index) => (
                              <button
                                key={`${item.word}-${item.meaning}`}
                                type="button"
                                onClick={() => {
                                  setInputText(item.word)
                                  setResult(null)
                                  setError(null)
                                }}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left ${index === dictionaryDetail.relatedWords!.length - 1 ? '' : 'border-b border-[var(--color-border)]'}`}
                              >
                                <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{item.word}</span>
                                <span className="max-w-[68%] truncate text-[13px] text-[var(--color-muted)]">{item.meaning}</span>
                              </button>
                            ))}
                          </div>
                        </section>
                      )}
                    </div>
                  )}
                </div>

                <aside className="mt-5 space-y-4 lg:mt-0">
                  <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                    <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">词条信息</h3>
                    <div className="mt-3 space-y-3 text-[13px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--color-muted)]">查询类型</span>
                        <span className="font-medium text-[var(--color-foreground)]">
                          {dictionaryQuery.split(/\s+/).length > 1 ? '英文词组' : '英文单词'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--color-muted)]">词性分组</span>
                        <span className="font-medium text-[var(--color-foreground)]">{dictionaryPartBlocks.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--color-muted)]">搭配数量</span>
                        <span className="font-medium text-[var(--color-foreground)]">{dictionaryDetail.phrasePatterns?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--color-muted)]">例句数量</span>
                        <span className="font-medium text-[var(--color-foreground)]">{dictionaryDetail.examples.length}</span>
                      </div>
                    </div>
                  </section>

                  {dictionarySuggestionPool.length > 0 && (
                    <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                      <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">继续查词</h3>
                      <div className="mt-3 space-y-2">
                        {dictionarySuggestionPool.map((item) => (
                          <button
                            key={`side-${item.word}`}
                            type="button"
                            onClick={() => {
                              setInputText(item.word)
                              setResult(null)
                              setError(null)
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-[var(--color-background-secondary)] px-3 py-2.5 text-left"
                          >
                            <span className="text-[13px] font-semibold text-[var(--color-foreground)]">{item.word}</span>
                            <span className="max-w-[58%] truncate text-[12px] text-[var(--color-muted)]">{item.meaning}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="rounded-[18px] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
                    <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">学习建议</h3>
                    <p className="mt-3 text-[13px] leading-6 text-[var(--color-muted)]">
                      先看简明释义，再切到词组和例句。若是抽象词或多义词，最后再看百科说明和联想词。
                    </p>
                  </section>
                </aside>
              </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mx-5 mt-2 flex-1 overflow-y-auto pb-4">
        <h3 className="font-secondary mb-3 text-[14px] font-semibold text-[var(--color-foreground)]">
          最近翻译
        </h3>
        {history.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[var(--color-muted)]">
            还没有翻译记录，试试输入一些文本吧 ✨
          </p>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="flex cursor-pointer items-center gap-3 border-b border-[var(--color-border)] py-3 transition-colors active:bg-[var(--color-background-secondary)]/50"
              onClick={() => {
                setInputText(item.source_text)
                setCurrentTranslationId(item.id)
                setSourceLang(resolveLanguageValueFromCode(item.source_lang, '简体中文'))
                setTargetLang(resolveLanguageValueFromCode(item.target_lang, 'English'))
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] text-[var(--color-foreground)]">
                  {item.source_text}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--color-muted)]">
                  {item.translated_text}
                </p>
              </div>
              {item.is_starred && <Star size={14} className="fill-[var(--color-primary)] text-[var(--color-primary)]" />}
              <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                {new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
