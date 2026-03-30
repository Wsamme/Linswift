import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, Volume2, RotateCcw, Check, HelpCircle, X, VolumeX, Lightbulb, Loader2 } from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import { useStudyRecords } from '../hooks/useStudyRecords'
import { calculateNextReview, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'
import { getDailyNewWordGoal } from '../lib/learnSettings'
import { speakAuto } from '../lib/tts'
import { supabase, type UserBook, type UserVocabulary, type UserVocabSet } from '../lib/supabase'
import { analyzeUnfamiliarWords, getFlashcardMnemonic, type UnfamiliarWord } from '../services/gemini'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { fetchResolvedUserBook, getBookAnalysisExcerpt } from '../lib/books'
import { useAuth } from '../contexts/AuthContext'
import { getVocabSetLearnSettings } from '../lib/vocabSetLearnSettings'
import { buildTodayStudyQueue } from '../lib/vocabStudyQueue'
import { useMediaQuery } from '../hooks/useMediaQuery'
import MobileFlashcardThreeDeck from '../components/flashcard/MobileFlashcardThreeDeck'

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
  mnemonic?: string
}

const FLASHCARD_AUTO_AUDIO_KEY = 'linswift_flashcard_auto_audio'
export default function FlashcardPage() {
  const goBack = useLogicalBack('/ebbinghaus')
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')
  const setId = searchParams.get('setId')
  const { user } = useAuth()
  const dailyNewWordGoal = getDailyNewWordGoal()
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
  const [setCards, setSetCards] = useState<StudyCard[] | null>(null)
  const [setStudyRows, setSetStudyRows] = useState<UserVocabulary[]>([])
  const [loadingSetCards, setLoadingSetCards] = useState(false)
  const [mnemonicMap, setMnemonicMap] = useState<Record<string, string>>({})
  const [mnemonicLoadingMap, setMnemonicLoadingMap] = useState<Record<string, boolean>>({})
  const pendingReviewsRef = useRef<Array<{ vocabularyId: number; result: 'known' | 'fuzzy' | 'unknown'; reviewType: string }>>([])
  const pendingProgressRef = useRef<Array<{ id: number; nextReviewAt: string | null; reviewCount: number; masteryLevel: number }>>([])
  const flushedRef = useRef(false)

  // 仅"无 bookId"时，才使用全局词库逻辑（兼容旧入口）
  useEffect(() => {
    if (!bookId && !setId) {
      // 全局词库模式读取"今天整天的学习任务"，与艾宾浩斯看板口径一致
      fetchVocabulary('today')
    }
  }, [bookId, setId]) // eslint-disable-line react-hooks/exhaustive-deps

  // "阅读准备页 -> 词汇学习"专用：优先使用阅读准备页缓存的同一批词
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

  useEffect(() => {
    async function loadSetStudyCards() {
      if (!setId || bookId || !user) {
        setLoadingSetCards(false)
        setSetCards(null)
        setSetStudyRows([])
        return
      }

      const parsedSetId = parseInt(setId, 10)
      if (Number.isNaN(parsedSetId)) {
        setLoadingSetCards(false)
        setSetCards([])
        setSetStudyRows([])
        return
      }

      setLoadingSetCards(true)
      try {
        const { data: setMeta } = await supabase
          .from('user_vocab_sets')
          .select('*')
          .eq('user_id', user.id)
          .eq('id', parsedSetId)
          .maybeSingle<UserVocabSet>()

        const { data: mappingRows, error: mappingError } = await supabase
          .from('user_vocab_set_words')
          .select('vocabulary_id')
          .eq('user_id', user.id)
          .eq('set_id', parsedSetId)
          .order('created_at', { ascending: true })

        if (mappingError) throw mappingError

        const vocabularyIds = Array.from(
          new Set(
            (mappingRows || [])
              .map((row: { vocabulary_id: number | string | null }) => Number(row.vocabulary_id))
              .filter(Boolean)
          )
        )

        if (vocabularyIds.length === 0) {
          setSetStudyRows([])
          setSetCards([])
          return
        }

        const { data: rows, error: rowsError } = await supabase
          .from('user_vocabulary')
          .select('*')
          .eq('user_id', user.id)
          .lt('mastery_level', 5)
          .in('id', vocabularyIds)

        if (rowsError) throw rowsError

        const persistedDailyGoal = Number(setMeta?.daily_new_goal)
        const queueRows = buildTodayStudyQueue(
          (rows || []) as UserVocabulary[],
          getVocabSetLearnSettings(
            user.id,
            parsedSetId,
            dailyNewWordGoal,
            {
              dailyGoal: Number.isFinite(persistedDailyGoal) && persistedDailyGoal > 0
                ? persistedDailyGoal
                : undefined,
            }
          ).dailyGoal
        ).queue

        setSetStudyRows(queueRows)
        setSetCards(queueRows.map((item) => ({
          id: item.id,
          word: item.word,
          phonetic: item.phonetic || '',
          meaning: item.meaning || '',
          example: item.example_sentence || '',
        })))
      } catch {
        setSetStudyRows([])
        setSetCards([])
      } finally {
        setLoadingSetCards(false)
      }
    }

    loadSetStudyCards()
  }, [setId, bookId, user, dailyNewWordGoal])

  // 词卡来源优先级：
  // 1) 有 bookId：使用书籍专属词卡（和"建议先学习词汇"一致）
  // 2) 无 bookId：沿用原有全局词库/Mock 逻辑
  const fallbackCards = useMemo<StudyCard[]>(() => (
    vocabulary.length > 0
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
  ), [vocabulary])

  const activeVocabularyRows = setId ? setStudyRows : vocabulary
  const finalCards = useMemo(() => (
    bookId
      ? (bookCards ?? [])
      : setId
        ? (setCards ?? [])
        : fallbackCards
  ), [bookId, bookCards, setId, setCards, fallbackCards])
  const currentCard = finalCards[currentIndex]
  const isFinished = currentIndex >= finalCards.length
  const spokenWordRef = useRef<string>('')
  const currentMnemonicKey = `${currentCard?.id ?? 'none'}:${currentCard?.word ?? ''}`
  const currentMnemonic = currentCard ? (mnemonicMap[currentMnemonicKey] || currentCard.mnemonic || '') : ''
  const mnemonicLoading = currentCard ? Boolean(mnemonicLoadingMap[currentMnemonicKey]) : false

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

  useEffect(() => {
    if (!currentCard) return

    const preloadCards = [currentCard, finalCards[currentIndex + 1]].filter((item): item is StudyCard => Boolean(item))
    let disposed = false

    preloadCards.forEach((item) => {
      const key = `${item.id}:${item.word}`
      if (mnemonicMap[key] || mnemonicLoadingMap[key]) return

      setMnemonicLoadingMap((prev) => ({ ...prev, [key]: true }))

      getFlashcardMnemonic(item.word, item.meaning)
        .then((mnemonic) => {
          if (disposed) return
          setMnemonicMap((prev) => ({ ...prev, [key]: mnemonic }))
        })
        .catch(() => {})
        .finally(() => {
          if (disposed) return
          setMnemonicLoadingMap((prev) => ({ ...prev, [key]: false }))
        })
    })

    return () => {
      disposed = true
    }
  }, [currentCard, currentIndex, finalCards, mnemonicLoadingMap, mnemonicMap])

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
    if (!bookId && currentCard && currentCard.id > 0) {
      const current = activeVocabularyRows.find(v => v.id === currentCard.id)

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
  const isLoadingCards = bookId
    ? loadingBookCards
    : setId
      ? loadingSetCards
      : loading

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
        {isLoadingCards ? (
          <div className="text-center">
            <p className="text-[14px] text-[var(--color-muted)]">
              {bookId ? '正在加载本书词汇...' : setId ? '正在加载该词本学习任务...' : '正在加载今日学习任务...'}
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
          isDesktop ? (
            <div className="relative w-full max-w-[320px]" style={{ perspective: '1000px' }}>
              {currentIndex + 2 < finalCards.length && (
                <div className="absolute inset-0 top-4 mx-4 bg-[var(--color-card)] rounded-[var(--radius-lg)] border border-[var(--color-border)] opacity-40" />
              )}
              {currentIndex + 1 < finalCards.length && (
                <div className="absolute inset-0 top-2 mx-2 bg-[var(--color-card)] rounded-[var(--radius-lg)] border border-[var(--color-border)] opacity-60" />
              )}

              <div
                className="relative w-full min-h-[280px] bg-[var(--color-card)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 cursor-pointer select-none active:scale-[0.98] transition-transform"
                style={{ boxShadow: 'var(--shadow-card)' }}
                onClick={handleFlip}
              >
                {!isFlipped ? (
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
                  <div className="flex flex-col items-center justify-center h-full min-h-[240px]">
                    <h2 className="text-[24px] font-bold text-[var(--color-foreground)] mb-2">
                      {currentCard.word}
                    </h2>
                    <p className="text-[16px] text-[var(--color-primary)] font-semibold mb-3">
                      {currentCard.meaning}
                    </p>
                    <div className="w-full space-y-3">
                      <div className="w-full rounded-[var(--radius-xs)] bg-[var(--color-primary)]/8 p-3 text-left">
                        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--color-primary)]">
                          <Lightbulb size={14} /> AI 助记
                        </div>
                        {mnemonicLoading ? (
                          <div className="flex items-center gap-2 text-[12px] text-[var(--color-muted)]">
                            <Loader2 size={14} className="animate-spin" /> 正在生成形象记忆...
                          </div>
                        ) : (
                          <p className="text-[13px] leading-relaxed text-[var(--color-foreground)]">
                            {currentMnemonic || `把 ${currentCard.word} 想成一个夸张鲜明的小场景，再和"${currentCard.meaning || '它的意思'}"牢牢绑在一起。`}
                          </p>
                        )}
                      </div>
                      {currentCard.example?.trim() ? (
                        <div className="w-full rounded-[var(--radius-xs)] bg-[var(--color-background-secondary)] p-3 text-left">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                            Example
                          </p>
                          <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed italic">
                            "{currentCard.example}"
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-[12px] text-[var(--color-muted)] mt-4">点击翻回正面</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[380px]">
              <MobileFlashcardThreeDeck
                key={`${currentCard.id}:${isFlipped ? 'back' : 'front'}`}
                card={currentCard}
                flipped={isFlipped}
                mnemonic={currentMnemonic}
                mnemonicLoading={mnemonicLoading}
                onFlip={handleFlip}
                onSwipeKnow={() => void handleChoice('know')}
                onSwipeUnknown={() => void handleChoice('unknown')}
              />
              {currentCard && (
                <div className="mt-3 flex items-center justify-center">
                  <button
                    onClick={() => speakAuto(currentCard.word)}
                    className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium text-[var(--color-primary)]"
                    style={{ background: 'rgba(255,132,0,0.1)' }}
                  >
                    <Volume2 size={15} /> 播放发音
                  </button>
                </div>
              )}
            </div>
          )
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
