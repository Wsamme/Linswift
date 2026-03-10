import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ArrowLeftRight, Star, Volume2, Copy, X, Sparkles, Loader2, Check,
} from 'lucide-react'
import {
  translateText,
  type TranslateResult,
  type UnfamiliarWord,
} from '../services/gemini'
import { useVocabulary } from '../hooks/useVocabulary'
import { useTranslations } from '../hooks/useTranslations'
import { useStudyRecords } from '../hooks/useStudyRecords'
import { speakEnglish, speakChinese } from '../lib/tts'

export default function TranslatePage() {
  const { addWords } = useVocabulary()
  const {
    history,
    fetchHistory,
    saveTranslation,
    toggleStar,
  } = useTranslations()
  const { appendStudy } = useStudyRecords()

  const [inputText, setInputText] = useState('')
  const [sourceLang, setSourceLang] = useState('中文')
  const [targetLang, setTargetLang] = useState('English')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)
  const [collected, setCollected] = useState(false)
  const [currentTranslationId, setCurrentTranslationId] = useState<number | null>(null)

  useEffect(() => { fetchHistory(20) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const currentHistoryItem = useMemo(
    () => history.find(item => item.id === currentTranslationId) || null,
    [history, currentTranslationId]
  )

  const isCurrentStarred = !!currentHistoryItem?.is_starred

  const swapLanguages = () => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    if (result) {
      setInputText(result.translatedText)
      setResult(null)
    }
  }

  const handleTranslate = useCallback(async () => {
    if (!inputText.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const translateResult = await translateText(inputText, sourceLang, targetLang)
      setResult(translateResult)

      const { data } = await saveTranslation({
        source_text: inputText,
        translated_text: translateResult.translatedText,
        source_lang: sourceLang === '中文' ? 'zh' : 'en',
        target_lang: targetLang === '中文' ? 'zh' : 'en',
        unfamiliar_words: translateResult.unfamiliarWords.map(w => w.word),
      })

      setCurrentTranslationId(data?.id ?? null)
      setCollected(false)

      await appendStudy({ study_duration: 1 })
    } catch (err) {
      setError(err instanceof Error ? err.message : '翻译失败')
    } finally {
      setIsLoading(false)
    }
  }, [inputText, sourceLang, targetLang, saveTranslation, appendStudy])

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

  const renderHighlightedText = (text: string, words: UnfamiliarWord[]) => {
    if (words.length === 0) return <span>{text}</span>

    const pattern = new RegExp(
      `\\b(${words.map(w => w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
      'gi'
    )

    const parts = text.split(pattern)

    return parts.map((part, i) => {
      const matchedWord = words.find(
        w => w.word.toLowerCase() === part.toLowerCase()
      )

      if (matchedWord) {
        return (
          <span
            key={i}
            className="text-[var(--color-primary)] underline decoration-dashed underline-offset-4 cursor-pointer"
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
    <div className="flex flex-col h-full">
      <div className="px-5 py-4">
        <h1 className="text-[20px] font-bold text-[var(--color-foreground)] font-secondary">
          翻译
        </h1>
        <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
          Powered by Gemini AI ✨
        </p>
      </div>

      <div className="flex items-center justify-center gap-4 px-5 mb-4">
        <span className="text-[14px] font-semibold text-[var(--color-foreground)] flex-1 text-center py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)]">
          {sourceLang}
        </span>
        <button
          onClick={swapLanguages}
          className="w-9 h-9 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center shrink-0 active:scale-95 transition-transform"
        >
          <ArrowLeftRight size={16} className="text-[var(--color-primary)]" />
        </button>
        <span className="text-[14px] font-semibold text-[var(--color-foreground)] flex-1 text-center py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)]">
          {targetLang}
        </span>
      </div>

      <div
        className="mx-5 bg-[var(--color-card)] rounded-[var(--radius-md)] p-4 mb-3"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-start justify-between mb-2">
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
          placeholder="输入要翻译的文本..."
          className="w-full h-[100px] text-[15px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] bg-transparent outline-none resize-none"
        />
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <button className="p-1.5" onClick={() => {
              if (sourceLang === '中文') speakChinese(inputText)
              else speakEnglish(inputText)
            }}>
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
                className={isCurrentStarred ? 'text-[var(--color-primary)] fill-[var(--color-primary)]' : 'text-[var(--color-muted)]'}
              />
            </button>
            <button className="p-1.5" onClick={handleCopy}>
              <Copy size={18} className={copiedText ? 'text-[var(--color-success)]' : 'text-[var(--color-muted)]'} />
            </button>
          </div>
          <button
            onClick={handleTranslate}
            disabled={isLoading || !inputText.trim()}
            className="px-5 py-2 bg-[var(--color-primary)] text-white text-[13px] font-semibold rounded-[var(--radius-sm)] disabled:opacity-50 active:scale-95 transition-all flex items-center gap-2"
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
        <div className="mx-5 mb-3 p-3 bg-[var(--color-error)]/10 rounded-[var(--radius-sm)] text-[13px] text-[var(--color-error)]">
          {error}
        </div>
      )}

      {result && (
        <div
          className="mx-5 bg-[var(--color-card)] rounded-[var(--radius-md)] p-4 mb-3"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <span className="text-[12px] text-[var(--color-muted)] mb-2 block">
            翻译结果
          </span>
          <p className="text-[15px] text-[var(--color-foreground)] leading-relaxed">
            {renderHighlightedText(result.translatedText, result.unfamiliarWords)}
          </p>

          {result.unfamiliarWords.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <p className="text-[12px] text-[var(--color-muted)] mb-2">
                识别到 {result.unfamiliarWords.length} 个值得学习的词汇：
              </p>
              <div className="flex flex-wrap gap-2">
                {result.unfamiliarWords.map((w, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-primary-light)] rounded-full text-[12px]"
                    title={w.phonetic}
                  >
                    <span className="font-semibold text-[var(--color-primary)]">{w.word}</span>
                    <span className="text-[var(--color-muted)]">{w.meaning}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.unfamiliarWords.length > 0 && (
            <button
              className="flex items-center gap-2 mt-4 px-4 py-2.5 bg-[var(--color-primary-light)] rounded-[var(--radius-sm)] w-full justify-center active:scale-[0.98] transition-transform"
              disabled={collected}
              onClick={async () => {
                const words = result.unfamiliarWords.map(w => ({
                  word: w.word,
                  phonetic: w.phonetic,
                  meaning: w.meaning,
                  source: 'translate' as const,
                }))
                const { error: e } = await addWords(words)
                if (!e) {
                  setCollected(true)
                  await appendStudy({
                    vocabulary_learned: words.length,
                    study_duration: 2,
                  })
                }
              }}
            >
              {collected ? (
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

      <div className="mx-5 mt-2 flex-1 overflow-y-auto">
        <h3 className="text-[14px] font-semibold text-[var(--color-foreground)] mb-3 font-secondary">
          最近翻译
        </h3>
        {history.length === 0 ? (
          <p className="text-[13px] text-[var(--color-muted)] text-center py-8">
            还没有翻译记录，试试输入一些文本吧 ✨
          </p>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 py-3 border-b border-[var(--color-border)] cursor-pointer active:bg-[var(--color-background-secondary)]/50 transition-colors"
              onClick={() => {
                setInputText(item.source_text)
                setCurrentTranslationId(item.id)
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--color-foreground)] line-clamp-1">
                  {item.source_text}
                </p>
                <p className="text-[12px] text-[var(--color-muted)] mt-0.5 line-clamp-1">
                  {item.translated_text}
                </p>
              </div>
              {item.is_starred && <Star size={14} className="text-[var(--color-primary)] fill-[var(--color-primary)]" />}
              <span className="text-[11px] text-[var(--color-muted)] shrink-0">
                {new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
