import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, Volume2, RotateCcw, Check, HelpCircle, X, VolumeX } from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import { useStudyRecords } from '../hooks/useStudyRecords'
import { calculateNextReview, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'
import { speakAuto } from '../lib/tts'
import { type UserBook } from '../lib/supabase'
import { analyzeUnfamiliarWords, type UnfamiliarWord } from '../services/gemini'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { fetchResolvedUserBook, getBookAnalysisExcerpt } from '../lib/books'

/**
 * 卡片学习页 —— 阅读器模块
 * 功能：
 *  1. 堆叠卡片效果（可见底层卡片边框）
 *  2. 点击翻转查看释义
 *  3. 底部按钮：会 / 模糊 / 不会
 *  4. 发音按钮
 *  5. 进度指示
 */

interface StudyCard {
  id: number
  word: string
  phonetic: string
  meaning: string
  example: string
}

const FLASHCARD_AUTO_AUDIO_KEY = 'linswift_flashcard_auto_audio'
export default function FlashcardPage() {
  const goBack = useLogicalBack('/ebbinghaus')
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')
  const { vocabulary, loading, fetchVocabulary, addReviewsBulk, updateNextReviewBulk } = useVocabulary()
  const { appendStudy } = useStudyRecords()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [results, setResults] = useState<('know' | 'vague' | 'unknown')[]>([])
  const [autoPlayAudio, setAutoPlayAudio] = useState<boolean>(() => {
    const raw = localStorage.getItem(FLASHCARD_AUTO_AUDIO_KEY)
    return raw === null ? true : raw === '1'
  })
  const [bookCards, setBookCards] = useState<StudyCard[] | null>(null)
  const [loadingBookCards, setLoadingBookCards] = useState(false)
  const pendingReviewsRef = useRef<Array<{ vocabularyId: number; result: 'known' | 'fuzzy' | 'unknown'; reviewType: string }>>([])
  const pendingProgressRef = useRef<Array<{ id: number; nextReviewAt: string | null; reviewCount: number; masteryLevel: number }>>([])
  const flushedRef = useRef(false)

  // 仅“无 bookId”时，才使用全局词库逻辑（兼容旧入口）
  useEffect(() => {
    if (!bookId) {
      // 全局词库模式读取“今天整天的学习任务”，与艾宾浩斯看板口径一致
      fetchVocabulary('today')
    }
  }, [bookId]) // eslint-disable-line react-hooks/exhaustive-deps

  // “阅读准备页 -> 词汇学习”专用：优先使用阅读准备页缓存的同一批词
  useEffect(() => {
    async function loadBookWords() {
      if (!bookId) return

      const parsedId = parseInt(bookId, 10)
      if (Number.isNaN(parsedId)) return

      setLoadingBookCards(true)
      try {
        const cacheKey = `readingPrepWords:${parsedId}`
        const cachedRaw = sessionStorage.getItem(cacheKey)

        let words: UnfamiliarWord[] = []
        if (cachedRaw) {
          words = JSON.parse(cachedRaw) as UnfamiliarWord[]
        } else {
          // 如果没有缓存，降级为重新分析（尽量保持可用）
          let sourceBook: UserBook | null = null
          sourceBook = await fetchResolvedUserBook(parsedId)

          if (sourceBook?.content_text) {
            words = await analyzeUnfamiliarWords(getBookAnalysisExcerpt(sourceBook.content_text), 12)
            sessionStorage.setItem(cacheKey, JSON.stringify(words))
          }
        }

        const generated: StudyCard[] = words.map((w, idx) => ({
          id: -100000 - idx,
          word: w.word,
          phonetic: w.phonetic || '',
          meaning: w.meaning || '',
          // 示例例句：保持轻量，避免无例句时空白体验
          example: `Try to use "${w.word}" in your own sentence.`,
        }))
        setBookCards(generated.length > 0 ? generated : [])
      } catch {
        setBookCards([])
      } finally {
        setLoadingBookCards(false)
      }
    }

    loadBookWords()
  }, [bookId])

  // 词卡来源优先级：
  // 1) 有 bookId：使用书籍专属词卡（和“建议先学习词汇”一致）
  // 2) 无 bookId：沿用原有全局词库/Mock 逻辑
  const fallbackCards: StudyCard[] = vocabulary.length > 0
    ? vocabulary
      .filter(v => (v.mastery_level ?? 0) < 5)
      .map(v => ({
        id: v.id,
        word: v.word,
        phonetic: v.phonetic || '',
        meaning: v.meaning || '',
        example: v.example_sentence || '',
      }))
    : []

  const finalCards = bookId ? (bookCards ?? []) : fallbackCards
  const currentCard = finalCards[currentIndex]
  const isFinished = currentIndex >= finalCards.length
  const spokenWordRef = useRef<string>('')

  useEffect(() => {
    localStorage.setItem(FLASHCARD_AUTO_AUDIO_KEY, autoPlayAudio ? '1' : '0')
  }, [autoPlayAudio])

  useEffect(() => {
    if (!autoPlayAudio || isFinished || !currentCard || isFlipped) return
    const key = `${currentIndex}:${currentCard.word}`
    if (spokenWordRef.current === key) return
    spokenWordRef.current = key
    speakAuto(currentCard.word)
  }, [autoPlayAudio, isFinished, currentCard, currentIndex, isFlipped])

  const flushPendingReviews = useCallback(async () => {
    if (flushedRef.current || bookId) return
    const reviewRows = pendingReviewsRef.current
    const progressRows = pendingProgressRef.current
    if (reviewRows.length === 0 && progressRows.length === 0) return

    flushedRef.current = true
    await Promise.all([
      addReviewsBulk(reviewRows),
      updateNextReviewBulk(progressRows),
    ])
    pendingReviewsRef.current = []
    pendingProgressRef.current = []
  }, [bookId, addReviewsBulk, updateNextReviewBulk])

  useEffect(() => {
    if (isFinished) {
      flushPendingReviews().catch(() => {})
    }
  }, [isFinished, flushPendingReviews])

  useEffect(() => {
    return () => {
      flushPendingReviews().catch(() => {})
    }
  }, [flushPendingReviews])

  const handleBack = useCallback(async () => {
    await flushPendingReviews().catch(() => {})
    goBack()
  }, [flushPendingReviews, goBack])

  // ===== 翻转卡片 =====
  const handleFlip = () => setIsFlipped(!isFlipped)

  // ===== 处理用户选择（会/模糊/不会）=====
  const handleChoice = async (choice: 'know' | 'vague' | 'unknown') => {
    setResults(prev => [...prev, choice])
    setIsFlipped(false)
    // 异步写入数据库（不阻塞 UI）
    const resultMap = { know: 'known', vague: 'fuzzy', unknown: 'unknown' } as const

    // 仅全局词库模式才写入复习记录（书籍专属词卡是临时分析结果）
    if (!bookId && currentCard && vocabulary.length > 0) {
      const current = vocabulary.find(v => v.id === currentCard.id)

      if (current) {
        const reviewCycleDays = getReviewCycleDaysFromLocalStorage()
        const review = calculateNextReview(current.mastery_level, resultMap[choice], reviewCycleDays)
        const nextReviewAt =
          choice === 'vague' || choice === 'unknown'
            ? new Date().toISOString()
            : review.nextReviewAt
        pendingReviewsRef.current.push({
          vocabularyId: currentCard.id,
          result: resultMap[choice],
          reviewType: 'flashcard',
        })
        pendingProgressRef.current.push({
          id: currentCard.id,
          nextReviewAt,
          reviewCount: (current.review_count || 0) + 1,
          masteryLevel: review.newMastery,
        })
      }
    }

    appendStudy({
      study_duration: 1,
      vocabulary_learned: choice === 'know' ? 1 : 0,
    }).catch(() => {})

    setCurrentIndex(prev => prev + 1)
  }

  // ===== 重新开始 =====
  const handleRestart = () => {
    setCurrentIndex(0)
    setIsFlipped(false)
    setResults([])
    pendingReviewsRef.current = []
    pendingProgressRef.current = []
    flushedRef.current = false
  }

  // ===== 统计结果 =====
  const knowCount = results.filter(r => r === 'know').length
  const vagueCount = results.filter(r => r === 'vague').length
  const unknownCount = results.filter(r => r === 'unknown').length

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={handleBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">词汇学习</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoPlayAudio((v) => !v)}
            className={`p-1.5 rounded-full ${autoPlayAudio ? 'bg-[var(--color-primary-light)]' : 'bg-[var(--color-background-secondary)]'}`}
            title={autoPlayAudio ? '自动发音已开启' : '自动发音已关闭'}
          >
            {autoPlayAudio
              ? <Volume2 size={16} className="text-[var(--color-primary)]" />
              : <VolumeX size={16} className="text-[var(--color-muted)]" />}
          </button>
          <span className="text-[13px] text-[var(--color-muted)]">
            {Math.min(currentIndex + 1, finalCards.length)}/{finalCards.length}
          </span>
        </div>
      </div>

      {/* ===== 进度条 ===== */}
      <div className="mx-5 mb-6 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-primary)] rounded-full transition-all duration-300"
          style={{ width: `${finalCards.length > 0 ? (currentIndex / finalCards.length) * 100 : 0}%` }}
        />
      </div>

      {/* ===== 卡片区域 ===== */}
      <div className="flex-1 flex items-center justify-center px-8">
        {loadingBookCards || (!bookId && loading) ? (
          <div className="text-center">
            <p className="text-[14px] text-[var(--color-muted)]">
              {bookId ? '正在加载本书词汇...' : '正在加载今日学习任务...'}
            </p>
          </div>
        ) : finalCards.length === 0 ? (
          <div className="text-center">
            <p className="text-[14px] text-[var(--color-muted)]">今天没有待学习词汇了</p>
          </div>
        ) : isFinished ? (
          /* 学习完成 - 结果统计 */
          <div className="w-full text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-[var(--color-success)]" />
            </div>
            <h2 className="text-[22px] font-bold text-[var(--color-foreground)] mb-2">学习完成！</h2>
            <p className="text-[14px] text-[var(--color-muted)] mb-6">你已经复习了 {finalCards.length} 个单词</p>

            {/* 结果统计 */}
            <div className="flex justify-center gap-6 mb-8">
              <div className="text-center">
                <span className="text-[24px] font-bold text-[var(--color-success)]">{knowCount}</span>
                <p className="text-[12px] text-[var(--color-muted)]">会</p>
              </div>
              <div className="text-center">
                <span className="text-[24px] font-bold text-[var(--color-primary)]">{vagueCount}</span>
                <p className="text-[12px] text-[var(--color-muted)]">模糊</p>
              </div>
              <div className="text-center">
                <span className="text-[24px] font-bold text-[var(--color-error)]">{unknownCount}</span>
                <p className="text-[12px] text-[var(--color-muted)]">不会</p>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={handleRestart}
                className="flex-1 py-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-[var(--color-foreground)] flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} /> 重新学习
              </button>
              <button
                onClick={handleBack}
                className="flex-1 py-3 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-white flex items-center justify-center gap-2"
              >
                <ChevronLeft size={16} /> 返回
              </button>
            </div>
          </div>
        ) : (
          /* 卡片堆叠效果 */
          <div className="relative w-full max-w-[320px]" style={{ perspective: '1000px' }}>
            {/* 底层卡片（装饰用，模拟堆叠） */}
            {currentIndex + 2 < finalCards.length && (
              <div className="absolute inset-0 top-4 mx-4 bg-[var(--color-card)] rounded-[var(--radius-lg)] border border-[var(--color-border)] opacity-40" />
            )}
            {currentIndex + 1 < finalCards.length && (
              <div className="absolute inset-0 top-2 mx-2 bg-[var(--color-card)] rounded-[var(--radius-lg)] border border-[var(--color-border)] opacity-60" />
            )}

            {/* 当前卡片 */}
            <div
              className="relative w-full min-h-[280px] bg-[var(--color-card)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 cursor-pointer select-none active:scale-[0.98] transition-transform"
              style={{ boxShadow: 'var(--shadow-card)' }}
              onClick={handleFlip}
            >
              {!isFlipped ? (
                /* 正面：单词 + 音标 */
                <div className="flex flex-col items-center justify-center h-full min-h-[240px]">
                  <h2 className="text-[28px] font-bold text-[var(--color-foreground)] mb-3">
                    {currentCard.word}
                  </h2>
                  <p className="text-[14px] text-[var(--color-muted)] mb-4">{currentCard.phonetic}</p>
                  <button
                    className="p-2 rounded-full bg-[var(--color-primary-light)]"
                    onClick={(e) => { e.stopPropagation(); speakAuto(currentCard.word) }}
                  >
                    <Volume2 size={20} className="text-[var(--color-primary)]" />
                  </button>
                  <p className="text-[12px] text-[var(--color-muted)] mt-6">点击翻转查看释义</p>
                </div>
              ) : (
                /* 背面：释义 + 例句/助记提示 */
                <div className="flex flex-col items-center justify-center h-full min-h-[240px]">
                  <h2 className="text-[24px] font-bold text-[var(--color-foreground)] mb-2">
                    {currentCard.word}
                  </h2>
                  <p className="text-[16px] text-[var(--color-primary)] font-semibold mb-3">
                    {currentCard.meaning}
                  </p>
                  <div className="w-full p-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)]">
                    {currentCard.example?.trim() ? (
                      <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed italic">
                        "{currentCard.example}"
                      </p>
                    ) : (
                      <p className="text-[13px] text-[var(--color-muted)] leading-relaxed">
                        助记提示：尝试用 <span className="font-semibold text-[var(--color-foreground)]">{currentCard.word}</span> 自己造一个句子。
                      </p>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--color-muted)] mt-4">点击翻回正面</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== 底部操作按钮（学习中才显示）===== */}
      {!isFinished && (
        <div className="px-5 py-5 flex justify-center gap-4">
          {/* 不会 */}
          <button
            onClick={() => handleChoice('unknown')}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center active:scale-90 transition-transform">
              <X size={24} className="text-[var(--color-error)]" />
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">不会</span>
          </button>
          {/* 模糊 */}
          <button
            onClick={() => handleChoice('vague')}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center active:scale-90 transition-transform">
              <HelpCircle size={24} className="text-[var(--color-primary)]" />
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">模糊</span>
          </button>
          {/* 会 */}
          <button
            onClick={() => handleChoice('know')}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center active:scale-90 transition-transform">
              <Check size={24} className="text-[var(--color-success)]" />
            </div>
            <span className="text-[11px] text-[var(--color-muted)]">会</span>
          </button>
        </div>
      )}
    </div>
  )
}
