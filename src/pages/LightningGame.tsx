import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trophy, Clock3, Zap, RotateCcw, Check, X, Volume2, VolumeX } from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { type WordPair, shuffleArray, calcCorrectScore } from '../lib/gameEngine'
import { calculateNextReview, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'
import { speakEnglish } from '../lib/tts'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'

const TOTAL_SECONDS = 30
const REQUIRED_CORRECT_PER_WORD = 2
const MIN_WORD_POOL = 4
const TARGET_WORD_POOL = 12
const AUTO_AUDIO_KEY = 'linswift_lightning_auto_audio'

type Status = 'loading' | 'playing' | 'finished' | 'empty'

interface Question {
  target: WordPair
  options: WordPair[]
}

function isLikelyEnglishWord(word: string): boolean {
  return /^[a-zA-Z][a-zA-Z' -]{1,40}$/.test(word.trim())
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

function createQuestion(pool: WordPair[], masteryMap: Record<string, number>): Question | null {
  const targetCandidates = pool.filter((w) => (masteryMap[normalizeWord(w.english)] || 0) < REQUIRED_CORRECT_PER_WORD)
  if (targetCandidates.length === 0) return null

  const target = shuffleArray(targetCandidates)[0]
  const distractors = shuffleArray(pool.filter(w => normalizeWord(w.english) !== normalizeWord(target.english))).slice(0, 3)
  if (distractors.length < 3) return null

  return { target, options: shuffleArray([target, ...distractors]) }
}

async function fetchDbSupplementWords(userId: string, existingWords: Set<string>, needed: number): Promise<WordPair[]> {
  if (needed <= 0) return []

  const supplements: WordPair[] = []

  // 1) 主库优先：用户书籍提取的陌生词（book_unfamiliar_words）
  const { data: userBooks } = await supabase
    .from('user_books')
    .select('id')
    .eq('user_id', userId)
    .limit(200)

  const bookIds = (userBooks || []).map((b: { id: number }) => b.id)
  if (bookIds.length > 0) {
    const { data: rawWords } = await supabase
      .from('book_unfamiliar_words')
      .select('word,context')
      .in('book_id', bookIds)
      .limit(1000)

    const fromBooks = shuffleArray((rawWords || []) as Array<{ word: string; context: string | null }>)
    for (const row of fromBooks) {
      const word = (row.word || '').trim()
      const key = normalizeWord(word)
      if (!isLikelyEnglishWord(word)) continue
      if (existingWords.has(key)) continue
      existingWords.add(key)
      supplements.push({
        english: word,
        chinese: (row.context || '').trim().slice(0, 36) || '数据库陌生词',
        phonetic: '',
      })
      if (supplements.length >= needed) break
    }
  }

  // 2) 仍不足：从 user_vocabulary 里随机补（仍来自主数据库）
  if (supplements.length < needed) {
    const remain = needed - supplements.length
    const { data: dbVocab } = await supabase
      .from('user_vocabulary')
      .select('word,meaning,phonetic')
      .eq('user_id', userId)
      .lte('mastery_level', 1)
      .limit(1000)

    const fromVocab = shuffleArray((dbVocab || []) as Array<{ word: string; meaning: string | null; phonetic: string | null }>)
    for (const row of fromVocab) {
      const word = (row.word || '').trim()
      const key = normalizeWord(word)
      if (!isLikelyEnglishWord(word)) continue
      if (existingWords.has(key)) continue
      existingWords.add(key)
      supplements.push({
        english: word,
        chinese: (row.meaning || '').trim() || '数据库陌生词',
        phonetic: (row.phonetic || '').trim(),
      })
      if (supplements.length >= remain + (needed - remain)) break
      if (supplements.length >= needed) break
    }
  }

  return supplements.slice(0, needed)
}

export default function LightningGame() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/vocab-game')
  const { user } = useAuth()
  const { vocabulary, fetchVocabulary, loading: vocabLoading, addReview, updateNextReview } = useVocabulary()

  const [status, setStatus] = useState<Status>('loading')
  const [pool, setPool] = useState<WordPair[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [pickedWord, setPickedWord] = useState<string | null>(null)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [masteryMap, setMasteryMap] = useState<Record<string, number>>({})
  const [autoPlayAudio, setAutoPlayAudio] = useState<boolean>(() => {
    const raw = localStorage.getItem(AUTO_AUDIO_KEY)
    return raw === null ? true : raw === '1'
  })

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lockRef = useRef(false)
  const savedRef = useRef(false)

  useEffect(() => {
    fetchVocabulary('all')
  }, [fetchVocabulary])

  useEffect(() => {
    localStorage.setItem(AUTO_AUDIO_KEY, autoPlayAudio ? '1' : '0')
  }, [autoPlayAudio])

  useEffect(() => {
    async function initRound() {
      if (status !== 'loading' || vocabLoading || !user) return

      const dbWords = vocabulary
        .filter(v => v.word)
        .map(v => ({
          id: v.id,
          english: (v.word || '').trim(),
          chinese: (v.meaning || '').trim() || '数据库词汇',
          phonetic: (v.phonetic || '').trim(),
          mastery_level: v.mastery_level,
        }))
        .filter(v => isLikelyEnglishWord(v.english))

      // 优先抽陌生词（mastery<=1）
      const unfamiliar = dbWords.filter(w => (w.mastery_level ?? 0) <= 1)
      const fallbackAll = dbWords
      const initial = shuffleArray(unfamiliar.length >= MIN_WORD_POOL ? unfamiliar : fallbackAll)

      const dedupMap = new Map<string, WordPair>()
      initial.forEach((w) => {
        const key = normalizeWord(w.english)
        if (!dedupMap.has(key)) {
          dedupMap.set(key, {
            id: w.id,
            english: w.english,
            chinese: w.chinese,
            phonetic: w.phonetic,
          })
        }
      })

      let finalPool = Array.from(dedupMap.values())

      if (finalPool.length < TARGET_WORD_POOL) {
        const existing = new Set(finalPool.map(w => normalizeWord(w.english)))
        const needed = TARGET_WORD_POOL - finalPool.length
        const supplements = await fetchDbSupplementWords(user.id, existing, needed)
        finalPool = [...finalPool, ...supplements]
      }

      finalPool = shuffleArray(finalPool).slice(0, Math.min(TARGET_WORD_POOL, finalPool.length))

      if (finalPool.length < MIN_WORD_POOL) {
        setStatus('empty')
        return
      }

      const initialMastery: Record<string, number> = {}
      const firstQuestion = createQuestion(finalPool, initialMastery)
      if (!firstQuestion) {
        setStatus('empty')
        return
      }

      setPool(finalPool)
      setMasteryMap(initialMastery)
      setQuestion(firstQuestion)
      setTimeLeft(TOTAL_SECONDS)
      setScore(0)
      setCombo(0)
      setMaxCombo(0)
      setCorrectCount(0)
      setWrongCount(0)
      setAnsweredCount(0)
      setPickedWord(null)
      setLastCorrect(null)
      lockRef.current = false
      savedRef.current = false
      setStatus('playing')
    }

    void initRound()
  }, [status, vocabLoading, vocabulary, user])

  useEffect(() => {
    if (status !== 'playing') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          setStatus('finished')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status])

  useEffect(() => {
    if (status !== 'playing' || !question || !autoPlayAudio) return
    speakEnglish(question.target.english)
  }, [status, question, autoPlayAudio])

  useEffect(() => {
    async function loadHighScore() {
      if (!user) return
      const { data, error } = await supabase
        .from('game_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('game_type', 'flash')
        .order('score', { ascending: false })
        .limit(1)
      if (!error && data && data.length > 0) setHighScore(data[0].score || 0)
    }
    void loadHighScore()
  }, [user])

  const handlePick = useCallback((option: WordPair) => {
    if (status !== 'playing' || !question || lockRef.current || timeLeft <= 0) return
    lockRef.current = true

    const correct = normalizeWord(option.english) === normalizeWord(question.target.english)
    const nextCombo = correct ? combo + 1 : 0

    setPickedWord(option.english)
    setLastCorrect(correct)
    setAnsweredCount(prev => prev + 1)

    let nextMasteryMap = masteryMap
    if (correct) {
      if (typeof question.target.id === 'number') {
        const current = vocabulary.find(v => v.id === question.target.id)
        if (current) {
          const cycle = getReviewCycleDaysFromLocalStorage()
          const review = calculateNextReview(current.mastery_level, 'known', cycle)
          addReview(current.id, 'known', 'game').catch(() => {})
          updateNextReview(current.id, review.nextReviewAt, (current.review_count || 0) + 1, review.newMastery).catch(() => {})
        }
      }

      const targetKey = normalizeWord(question.target.english)
      nextMasteryMap = {
        ...masteryMap,
        [targetKey]: (masteryMap[targetKey] || 0) + 1,
      }
      setMasteryMap(nextMasteryMap)

      setCorrectCount(prev => prev + 1)
      setCombo(nextCombo)
      setMaxCombo(prev => Math.max(prev, nextCombo))
      setScore(prev => prev + Math.max(60, Math.floor(calcCorrectScore(nextCombo) * 0.8)))
    } else {
      setWrongCount(prev => prev + 1)
      setCombo(0)
      setScore(prev => Math.max(0, prev - 10))
    }

    window.setTimeout(() => {
      const nextQuestion = createQuestion(pool, nextMasteryMap)
      if (!nextQuestion) {
        if (timerRef.current) clearInterval(timerRef.current)
        setStatus('finished')
        setTimeLeft(0)
      } else {
        setQuestion(nextQuestion)
      }
      setPickedWord(null)
      setLastCorrect(null)
      lockRef.current = false
    }, 220)
  }, [combo, masteryMap, pool, question, status, timeLeft, vocabulary, addReview, updateNextReview])

  useEffect(() => {
    async function saveScore() {
      if (status !== 'finished' || savedRef.current || !user) return
      savedRef.current = true
      const practicedWords = pool.map(w => normalizeWord(w.english)).slice(0, Math.max(10, answeredCount))
      const { error } = await supabase.from('game_scores').insert({
        user_id: user.id,
        game_type: 'flash',
        score,
        duration_seconds: TOTAL_SECONDS,
        words_practiced: practicedWords,
      })
      if (error) {
        console.error('[game_scores] flash insert failed:', error.message)
        return
      }
      if (score > highScore) setHighScore(score)
    }
    void saveScore()
  }, [status, user, score, pool, answeredCount, highScore])

  const accuracy = useMemo(() => {
    if (answeredCount === 0) return 0
    return Math.round((correctCount / answeredCount) * 100)
  }, [answeredCount, correctCount])

  const masteredWordCount = useMemo(() => {
    return Object.values(masteryMap).filter((v) => v >= REQUIRED_CORRECT_PER_WORD).length
  }, [masteryMap])

  if (status === 'loading') {
    return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center"><div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
  }

  if (status === 'empty') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[18px] font-bold text-[var(--color-foreground)] mb-2">词库不足，无法开始游戏</p>
        <p className="text-[13px] text-[var(--color-muted)] mb-5">至少需要 4 个可训练词汇（已从主数据库尝试随机补词）</p>
        <button onClick={() => navigateSafely(navigate, '/app/vocab')} className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold">前往词库</button>
      </div>
    )
  }

  if (status === 'finished') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8">
        <Trophy size={64} className="text-[var(--color-primary)] mb-4" />
        <h1 className="text-[28px] font-bold text-[var(--color-foreground)] mb-2">限时闪电结束</h1>
        <p className="text-[14px] text-[var(--color-muted)] mb-8">30 秒作答 {answeredCount} 题 · 达标词 {masteredWordCount}</p>
        <div className="w-full max-w-[320px] bg-[var(--color-card)] rounded-[var(--radius-lg)] p-6 mb-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-center mb-4">
            <p className="text-[40px] font-bold text-[var(--color-primary)]">{score}</p>
            <p className="text-[12px] text-[var(--color-muted)]">总分</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{correctCount}</p><p className="text-[10px] text-[var(--color-muted)]">答对</p></div>
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{wrongCount}</p><p className="text-[10px] text-[var(--color-muted)]">答错</p></div>
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{accuracy}%</p><p className="text-[10px] text-[var(--color-muted)]">正确率</p></div>
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{maxCombo}x</p><p className="text-[10px] text-[var(--color-muted)]">连击</p></div>
          </div>
          {score > highScore && highScore > 0 && <p className="text-center text-[12px] text-[var(--color-primary)] font-semibold mt-3">🎉 新纪录!</p>}
        </div>
        <div className="flex gap-3 w-full max-w-[320px]">
          <button onClick={goBack} className="flex-1 py-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-[var(--color-foreground)]">返回</button>
          <button onClick={() => setStatus('loading')} className="flex-1 py-3 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-white flex items-center justify-center gap-2"><RotateCcw size={16} /> 再来一局</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1"><ChevronLeft size={24} className="text-[var(--color-foreground)]" /></button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">限时闪电</h1>
        <button
          onClick={() => setAutoPlayAudio(v => !v)}
          className={`p-1.5 rounded-full ${autoPlayAudio ? 'bg-[var(--color-primary-light)]' : 'bg-[var(--color-background-secondary)]'}`}
          title={autoPlayAudio ? '自动发音已开启' : '自动发音已关闭'}
        >
          {autoPlayAudio ? <Volume2 size={16} className="text-[var(--color-primary)]" /> : <VolumeX size={16} className="text-[var(--color-muted)]" />}
        </button>
      </div>

      <div className="mx-5 mb-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-card)] flex items-center gap-3" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex-1 flex items-center gap-2"><Trophy size={16} className="text-[var(--color-primary)]" /><span className="text-[18px] font-bold text-[var(--color-foreground)]">{score}</span></div>
        {combo > 1 && <div className="px-2.5 py-1 bg-[var(--color-primary-light)] rounded-full text-[12px] font-semibold text-[var(--color-primary)] flex items-center gap-1"><Zap size={12} />{combo}x</div>}
        <div className="px-3 py-1 rounded-full bg-[var(--color-background-secondary)] text-[14px] font-semibold text-[var(--color-foreground)] flex items-center gap-1.5"><Clock3 size={14} className={timeLeft <= 8 ? 'text-[var(--color-error)]' : 'text-[var(--color-muted)]'} />{timeLeft}s</div>
      </div>

      <div className="mx-5 mb-2 h-2 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${(timeLeft / TOTAL_SECONDS) * 100}%` }} />
      </div>
      <p className="mx-5 mb-4 text-[12px] text-[var(--color-muted)]">词汇达标：{masteredWordCount}/{pool.length}（每词答对 2 次即不再重复）</p>

      {question && (
        <>
          <div className="mx-5 mb-4 p-5 bg-[var(--color-card)] rounded-[var(--radius-lg)]" style={{ boxShadow: 'var(--shadow-card)' }}>
            <p className="text-[12px] text-[var(--color-muted)] mb-2">根据释义选择正确英文</p>
            <p className="text-[24px] font-bold text-[var(--color-foreground)]">{question.target.chinese}</p>
            {question.target.phonetic && <p className="text-[12px] text-[var(--color-muted)] mt-1">{question.target.phonetic}</p>}
            <button onClick={() => speakEnglish(question.target.english)} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-[12px] font-semibold"><Volume2 size={14} /> 播放发音</button>
            {lastCorrect !== null && (
              <p className={`text-[12px] mt-2 font-semibold ${lastCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {lastCorrect ? '正确 +分' : '错误 -10'}
              </p>
            )}
          </div>
          <div className="mx-5 grid grid-cols-1 md:grid-cols-2 gap-3 pb-8">
            {question.options.map(option => {
              const isPicked = pickedWord === option.english
              const isCorrect = normalizeWord(option.english) === normalizeWord(question.target.english)
              let cls = 'border-[var(--color-border)]'
              if (isPicked && !isCorrect) cls = 'border-[var(--color-error)] bg-[var(--color-error)]/10'
              if (isPicked && isCorrect) cls = 'border-[var(--color-success)] bg-[var(--color-success)]/10'
              return (
                <button
                  key={`${option.english}-${option.id ?? option.chinese}`}
                  onClick={() => handlePick(option)}
                  disabled={lockRef.current || timeLeft <= 0}
                  className={`p-4 rounded-[var(--radius-md)] border text-left bg-[var(--color-card)] transition-all ${cls}`}
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[18px] font-semibold text-[var(--color-foreground)] break-all">{option.english}</p>
                    {isPicked && isCorrect && <Check size={18} className="text-[var(--color-success)]" />}
                    {isPicked && !isCorrect && <X size={18} className="text-[var(--color-error)]" />}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
