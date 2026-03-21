import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ArrowLeftRight, Star, Volume2, Copy, X, Sparkles, Loader2, Check, Plus,
} from 'lucide-react'
import {
  type TranslationMode,
  translateText,
  type TranslateResult,
  type UnfamiliarWord,
} from '../services/translation'
import { useVocabulary } from '../hooks/useVocabulary'
import { useTranslations } from '../hooks/useTranslations'
import { useStudyRecords } from '../hooks/useStudyRecords'
import { speakEnglish, speakChinese, speakJapanese } from '../lib/tts'
import { normalizeLookupKey } from '../lib/text'
import DesktopScreenshotTranslator from '../components/translate/DesktopScreenshotTranslator'

const LANGUAGE_OPTIONS = [
  { value: '简体中文', code: 'zh-CN', shortLabel: '简中' },
  { value: '繁體中文', code: 'zh-TW', shortLabel: '繁中' },
  { value: 'English', code: 'en', shortLabel: 'English' },
  { value: '日本語', code: 'ja', shortLabel: '日本語' },
  { value: '한국어', code: 'ko', shortLabel: '한국어' },
] as const

const TRANSLATION_MODE_OPTIONS: Array<{
  value: TranslationMode
  label: string
  description: string
}> = [
  {
    value: 'hybrid',
    label: '混合模式',
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
} as const

type AppTranslateLanguage = (typeof LANGUAGE_OPTIONS)[number]['value']
type AppTranslateLanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code']

type AutocompleteSuggestion = {
  key: string
  text: string
  subtitle: string
  badge: string
  score: number
}

const LANG_CODE_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.value, option.code])
) as Record<AppTranslateLanguage, AppTranslateLanguageCode>

const LANG_SHORT_LABEL_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.value, option.shortLabel])
) as Record<AppTranslateLanguage, string>

const LANG_FROM_CODE_MAP = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.code, option.value])
) as Record<AppTranslateLanguageCode, AppTranslateLanguage>

function normalizeLanguageCode(languageCode: string) {
  const value = String(languageCode || '').trim().toLowerCase()
  if (!value) return 'en'
  if (value === 'zh' || value === 'zh-cn' || value === 'zh-hans') return 'zh-CN'
  if (value === 'zh-tw' || value === 'zh-hk' || value === 'zh-hant') return 'zh-TW'
  if (value === 'ja' || value === 'ja-jp') return 'ja'
  if (value === 'ko' || value === 'ko-kr') return 'ko'
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

  const voices = window.speechSynthesis.getVoices()
  const preferredVoice = voices.find((voice) =>
    voice.lang.toLowerCase().startsWith(languageCode.toLowerCase())
  )
  if (preferredVoice) utterance.voice = preferredVoice

  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
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

  const [inputText, setInputText] = useState('')
  const [sourceLang, setSourceLang] = useState<AppTranslateLanguage>('简体中文')
  const [targetLang, setTargetLang] = useState<AppTranslateLanguage>('English')
  const [translationMode, setTranslationMode] = useState<TranslationMode>(() => {
    const savedMode = localStorage.getItem('linswift.translate.mode')
    return savedMode === 'ai' || savedMode === 'deepl' || savedMode === 'hybrid'
      ? savedMode
      : 'hybrid'
  })
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)
  const [currentTranslationId, setCurrentTranslationId] = useState<number | null>(null)
  const [collectedWordSet, setCollectedWordSet] = useState<Record<string, boolean>>({})
  const [collectedPhraseKey, setCollectedPhraseKey] = useState<string | null>(null)
  const [isInputFocused, setIsInputFocused] = useState(false)

  useEffect(() => { fetchHistory(20) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('linswift.translate.mode', translationMode)
  }, [translationMode])

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

  const isCurrentStarred = !!currentHistoryItem?.is_starred

  const isVocabularyCollected = useCallback((value: string, languageCode: string) => {
    const targetKey = normalizeCollectKey(value, languageCode)
    return vocabulary.some((item) => (
      normalizeCollectKey(item.word, item.language_code || 'en') === targetKey
    ))
  }, [vocabulary])

  useEffect(() => {
    if (!result) {
      setCollectedWordSet({})
      setCollectedPhraseKey(null)
      return
    }

    const targetLanguageCode = LANG_CODE_MAP[targetLang]
    setCollectedPhraseKey(
      isVocabularyCollected(result.translatedText, targetLanguageCode)
        ? normalizeCollectKey(result.translatedText, targetLanguageCode)
        : null
    )

    setCollectedWordSet(
      result.unfamiliarWords.reduce<Record<string, boolean>>((acc, word) => {
        const collectKey = normalizeCollectKey(word.word, 'en')
        if (isVocabularyCollected(word.word, 'en')) {
          acc[collectKey] = true
        }
        return acc
      }, {})
    )
  }, [isVocabularyCollected, result, targetLang])

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
    if (!inputText.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const translateResult = await translateText(inputText, sourceLang, targetLang, translationMode)
      setResult(translateResult)

      const { data } = await saveTranslation({
        source_text: inputText,
        translated_text: translateResult.translatedText,
        source_lang: LANG_CODE_MAP[sourceLang],
        target_lang: LANG_CODE_MAP[targetLang],
        unfamiliar_words: translateResult.unfamiliarWords.map(w => w.word),
      })

      setCurrentTranslationId(data?.id ?? null)

      await appendStudy({ study_duration: 1 })
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败')
    } finally {
      setIsLoading(false)
    }
  }, [appendStudy, inputText, saveTranslation, sourceLang, targetLang, translationMode])

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

  const handleCollectTranslatedPhrase = useCallback(async () => {
    if (!result?.translatedText.trim()) return

    const targetLanguageCode = LANG_CODE_MAP[targetLang]
    const phraseKey = normalizeCollectKey(result.translatedText, targetLanguageCode)
    const { error: saveError } = await addWord({
      word: result.translatedText,
      language_code: targetLanguageCode,
      language_label: LANG_SHORT_LABEL_MAP[targetLang],
      meaning: inputText.trim() || undefined,
      example_sentence: `${sourceLang}：${inputText.trim()}`,
      source: 'translate',
    })

    if (!saveError) {
      setCollectedPhraseKey(phraseKey)
      await appendStudy({
        vocabulary_learned: 1,
        study_duration: 1,
      })
    }
  }, [addWord, appendStudy, inputText, result, sourceLang, targetLang])

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

  return (
    <div className="flex h-full min-h-[100dvh] flex-col bg-[var(--color-background)] pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="px-5 py-4">
        <h1 className="font-secondary text-[20px] font-bold text-[var(--color-foreground)]">
          翻译
        </h1>
        <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
          多语言翻译、词汇收藏与输入补全
        </p>
      </div>

      <DesktopScreenshotTranslator
        targetLang={targetLang}
        onUseExtractedText={(text) => {
          setInputText(text)
          setResult(null)
          setError(null)
        }}
      />

      <div className="mb-4 flex items-center justify-center gap-4 px-5">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value as AppTranslateLanguage)}
          className="flex-1 rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] py-2 text-center text-[14px] font-semibold text-[var(--color-foreground)] outline-none"
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
          className="flex-1 rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] py-2 text-center text-[14px] font-semibold text-[var(--color-foreground)] outline-none"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang.value} value={lang.value}>{lang.value}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 px-5">
        <div
          className="rounded-[var(--radius-md)] bg-[var(--color-card)] p-3"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--color-muted)]">翻译模式</span>
            <span className="text-[11px] text-[var(--color-muted-light)]">
              可随时切换
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TRANSLATION_MODE_OPTIONS.map((option) => {
              const active = translationMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTranslationMode(option.value)}
                  className={`rounded-[16px] border px-3 py-2 text-left transition-all active:scale-[0.98] ${
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-background-secondary)]'
                  }`}
                >
                  <span className={`block text-[13px] font-semibold ${
                    active ? 'text-[var(--color-primary)]' : 'text-[var(--color-foreground)]'
                  }`}
                  >
                    {option.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-[var(--color-muted)]">
                    {option.description}
                  </span>
                </button>
              )
            })}
          </div>
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
          onChange={(e) => setInputText(e.target.value)}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => window.setTimeout(() => setIsInputFocused(false), 120)}
          placeholder="输入要翻译的文本..."
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
            <div className="space-y-2">
              {autocompleteSuggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setInputText(suggestion.text)
                    setResult(null)
                    setError(null)
                    setIsInputFocused(false)
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-[14px] bg-[var(--color-background-secondary)] px-3 py-2 text-left transition-colors active:bg-[var(--color-primary-light)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--color-foreground)]">
                      {suggestion.text}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                      {suggestion.subtitle}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-primary)]">
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
            className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-5 py-2 text-[13px] font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                翻译中...
              </>
            ) : (
              '翻译'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mb-3 rounded-[var(--radius-sm)] bg-[var(--color-error)]/10 p-3 text-[13px] text-[var(--color-error)]">
          {error}
        </div>
      )}

      {result && (
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

          <p className="mt-3 text-[11px] text-[var(--color-muted-light)]">
            收藏时会写入 {LANG_SHORT_LABEL_MAP[targetLang]} 词库
          </p>

          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] px-4 py-2.5 transition-transform active:scale-[0.98]"
            disabled={collectedPhraseKey === normalizeCollectKey(result.translatedText, LANG_CODE_MAP[targetLang])}
            onClick={handleCollectTranslatedPhrase}
          >
            {collectedPhraseKey === normalizeCollectKey(result.translatedText, LANG_CODE_MAP[targetLang]) ? (
              <>
                <Check size={16} className="text-[var(--color-success)]" />
                <span className="text-[13px] font-semibold text-[var(--color-success)]">
                  已收藏到 {LANG_SHORT_LABEL_MAP[targetLang]} 词库
                </span>
              </>
            ) : (
              <>
                <Plus size={16} className="text-[var(--color-primary)]" />
                <span className="text-[13px] font-semibold text-[var(--color-primary)]">
                  收藏当前翻译到词库
                </span>
              </>
            )}
          </button>

          {result.unfamiliarWords.length > 0 && (
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

          {result.unfamiliarWords.length > 0 && (
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
