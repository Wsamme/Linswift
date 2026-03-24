import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Volume2, VolumeX, Trophy, Clock, Zap, RotateCcw, Check, X } from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { type WordPair, shuffleArray, calcCorrectScore, calcWrongPenalty } from '../lib/gameEngine'
import { calculateNextReview, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'

const AUTO_AUDIO_KEY = 'linswift_listen_identify_auto_audio'
const MIN_WORD_POOL = 4
const TARGET_WORD_POOL = 10
const REQUIRED_CORRECT_PER_WORD = 1

interface Question {
  target: WordPair
  options: WordPair[]
}

type Status = 'loading' | 'playing' | 'feedback' | 'finished' | 'empty'

function isLikelyEnglishWord(word: string): boolean {
  return /^[a-zA-Z][a-zA-Z' -]{0,40}$/.test(word.trim())
}

function normalizeWord(word: string): string {
  return word.trim().toLowerCase()
}

function pickQuestion(pool: WordPair[], masteryMap: Record<string, number>): Question | null {
  const candidates = pool.filter((w) => (masteryMap[normalizeWord(w.english)] || 0) < REQUIRED_CORRECT_PER_WORD)
  if (candidates.length === 0) return null

  const shuffled = shuffleArray(candidates)
  const target = shuffled[0]
  const distractors = shuffleArray(pool.filter(w => normalizeWord(w.english) !== normalizeWord(target.english))).slice(0, 3)
  if (distractors.length < 3) return null
  const options = shuffleArray([target, ...distractors])
  return { target, options }
}

export default function ListenIdentifyGame() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/vocab-game')
  const { user } = useAuth()
  const { vocabulary, fetchVocabulary, loading: vocabLoading, addReview, updateNextReview } = useVocabulary()

  const [status, setStatus] = useState<Status>('loading')
  const [pool, setPool] = useState<WordPair[]>([])
  const [question, setQuestion] = useState<Question | null>(null)
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [wrongCount, setWrongCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [masteryMap, setMasteryMap] = useState<Record<string, number>>({})
  const [autoPlayAudio, setAutoPlayAudio] = useState<boolean>(() => {
    const raw = localStorage.getItem(AUTO_AUDIO_KEY)
    return raw === null ? true : raw === '1'
  })

  const savedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const masteredCount = useMemo(() => Object.values(masteryMap).filter(v => v >= REQUIRED_CORRECT_PER_WORD).length, [masteryMap])
  const accuracy = useMemo(() => (answeredCount === 0 ? 0 : Math.round((correctCount / answeredCount) * 100)), [answeredCount, correctCount])

  useEffect(() => {
    fetchVocabulary('all')
  }, [fetchVocabulary])

  useEffect(() => {
    if (status !== 'loading' || vocabLoading) return

    const userWords: WordPair[] = vocabulary
      .filter(v => v.word)
      .map(v => ({
        id: v.id,
        english: (v.word || '').trim(),
        chinese: (v.meaning || '').trim() || '暂无释义',
        phonetic: v.phonetic || '',
      }))
      .filter(v => isLikelyEnglishWord(v.english))

    const dedup = new Map<string, WordPair>()
    userWords.forEach((w) => {
      const key = normalizeWord(w.english)
      if (!dedup.has(key)) dedup.set(key, w)
    })

    const roundPool = shuffleArray(Array.from(dedup.values())).slice(0, Math.min(TARGET_WORD_POOL, dedup.size))

    if (roundPool.length < MIN_WORD_POOL) {
      setStatus('empty')
      return
    }

    const initialMastery: Record<string, number> = {}
    const firstQuestion = pickQuestion(roundPool, initialMastery)
    if (!firstQuestion) {
      setStatus('empty')
      return
    }

    setPool(roundPool)
    setMasteryMap(initialMastery)
    setQuestion(firstQuestion)
    setScore(0)
    setCombo(0)
    setCorrectCount(0)
    setWrongCount(0)
    setAnsweredCount(0)
    setElapsed(0)
    setSelectedWord(null)
    setLastCorrect(null)
    savedRef.current = false
    setStatus('playing')
  }, [status, vocabLoading, vocabulary])

  useEffect(() => {
    localStorage.setItem(AUTO_AUDIO_KEY, autoPlayAudio ? '1' : '0')
  }, [autoPlayAudio])

  useEffect(() => {
    if (status !== 'playing' || !question || !autoPlayAudio) return
    speakEnglish(question.target.english)
  }, [status, question, autoPlayAudio])

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      stopSpeaking()
    }
  }, [])

  useEffect(() => {
    async function loadHighScore() {
      if (!user) return
      const { data, error } = await supabase
        .from('game_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('game_type', 'listen')
        .order('score', { ascending: false })
        .limit(1)
      if (!error && data && data.length > 0) setHighScore(data[0].score || 0)
    }
    void loadHighScore()
  }, [user])

  const handleChoose = useCallback((option: WordPair) => {
    if (status !== 'playing' || !question) return

    const correct = normalizeWord(option.english) === normalizeWord(question.target.english)
    setSelectedWord(option.english)
    setLastCorrect(correct)
    setAnsweredCount(prev => prev + 1)

    let nextMastery = masteryMap
    if (correct) {
      const key = normalizeWord(question.target.english)
      nextMastery = {
        ...masteryMap,
        [key]: (masteryMap[key] || 0) + 1,
      }
      setMasteryMap(nextMastery)

      if (typeof question.target.id === 'number') {
        const current = vocabulary.find(v => v.id === question.target.id)
        if (current) {
          const cycle = getReviewCycleDaysFromLocalStorage()
          const review = calculateNextReview(current.mastery_level, 'known', cycle)
          addReview(current.id, 'known', 'game').catch(() => {})
          updateNextReview(current.id, review.nextReviewAt, (current.review_count || 0) + 1, review.newMastery).catch(() => {})
        }
      }

      const nextCombo = combo + 1
      setCombo(nextCombo)
      setCorrectCount(prev => prev + 1)
      setScore(prev => prev + calcCorrectScore(nextCombo))
    } else {
      setCombo(0)
      setWrongCount(prev => prev + 1)
      setScore(prev => Math.max(0, prev + calcWrongPenalty()))
    }

    setStatus('feedback')

    setTimeout(() => {
      const nextQuestion = pickQuestion(pool, nextMastery)
      if (!nextQuestion) {
        if (timerRef.current) clearInterval(timerRef.current)
        setStatus('finished')
      } else {
        setQuestion(nextQuestion)
        setStatus('playing')
      }
      setSelectedWord(null)
      setLastCorrect(null)
    }, 700)
  }, [combo, masteryMap, pool, question, status])

  useEffect(() => {
    async function saveScore() {
      if (status !== 'finished' || savedRef.current || !user) return
      savedRef.current = true
      const practicedWords = pool
        .map(w => w.english?.trim().toLowerCase())
        .filter((w): w is string => Boolean(w))
        .slice(0, TARGET_WORD_POOL)
      const { error } = await supabase.from('game_scores').insert({
        user_id: user.id,
        game_type: 'listen',
        score,
        duration_seconds: elapsed,
        words_practiced: practicedWords,
      })
      if (error) {
        console.error('[game_scores] listen insert failed:', error.message)
        return
      }
      if (score > highScore) setHighScore(score)
    }
    void saveScore()
  }, [status, user, score, elapsed, pool, highScore])

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  if (status === 'loading') {
    return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center"><div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
  }

  if (status === 'empty') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[18px] font-bold text-[var(--color-foreground)] mb-2">词库不足，无法开始游戏</p>
        <p className="text-[13px] text-[var(--color-muted)] mb-5">需要至少 4 个英文词汇（建议在词库补充后再来）</p>
        <button onClick={() => navigateSafely(navigate, '/app/vocab')} className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold">前往词库</button>
      </div>
    )
  }

  if (status === 'finished') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8">
        <Trophy size={64} className="text-[var(--color-primary)] mb-4" />
        <h1 className="text-[28px] font-bold text-[var(--color-foreground)] mb-2">听音辨词完成</h1>
        <p className="text-[14px] text-[var(--color-muted)] mb-8">达标词 {masteredCount}/{pool.length}（每词答对 1 次即通过）</p>
        <div className="w-full max-w-[320px] bg-[var(--color-card)] rounded-[var(--radius-lg)] p-6 mb-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-center mb-4">
            <p className="text-[40px] font-bold text-[var(--color-primary)]">{score}</p>
            <p className="text-[12px] text-[var(--color-muted)]">总分</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{correctCount}</p><p className="text-[10px] text-[var(--color-muted)]">答对</p></div>
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{wrongCount}</p><p className="text-[10px] text-[var(--color-muted)]">答错</p></div>
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{accuracy}%</p><p className="text-[10px] text-[var(--color-muted)]">正确率</p></div>
            <div><p className="text-[16px] font-bold text-[var(--color-foreground)]">{formatTime(elapsed)}</p><p className="text-[10px] text-[var(--color-muted)]">用时</p></div>
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
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听音辨词</h1>
        <button
          onClick={() => setAutoPlayAudio(v => !v)}
          className={`p-1.5 rounded-full ${autoPlayAudio ? 'bg-[var(--color-primary-light)]' : 'bg-[var(--color-background-secondary)]'}`}
          title={autoPlayAudio ? '自动发音已开启' : '自动发音已关闭'}
        >
          {autoPlayAudio ? <Volume2 size={16} className="text-[var(--color-primary)]" /> : <VolumeX size={16} className="text-[var(--color-muted)]" />}
        </button>
      </div>

      <div className="mx-5 mb-4 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${pool.length > 0 ? (masteredCount / pool.length) * 100 : 0}%` }} />
      </div>

      <div className="mx-5 mb-1 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-1.5 bg-[var(--color-card)] px-3 py-2 rounded-[var(--radius-sm)]"><Trophy size={14} className="text-[var(--color-primary)]" /><span className="text-[14px] font-bold text-[var(--color-foreground)]">{score}</span></div>
        {combo > 0 && <div className="flex items-center gap-1.5 bg-[var(--color-primary-light)] px-3 py-2 rounded-[var(--radius-sm)]"><Zap size={14} className="text-[var(--color-primary)]" /><span className="text-[14px] font-bold text-[var(--color-primary)]">{combo}x</span></div>}
        <div className="flex items-center gap-1.5 bg-[var(--color-card)] px-3 py-2 rounded-[var(--radius-sm)]"><Clock size={14} className="text-[var(--color-muted)]" /><span className="text-[14px] text-[var(--color-foreground)]">{formatTime(elapsed)}</span></div>
      </div>
      <p className="mx-5 mb-4 text-[12px] text-[var(--color-muted)]">不限时，当前达标 {masteredCount}/{pool.length}（每词答对 1 次即通过）</p>

      {question && (
        <>
          <div className="mx-5 mb-4 p-5 bg-[var(--color-card)] rounded-[var(--radius-lg)] text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
            <p className="text-[12px] text-[var(--color-muted)] mb-2">听发音选单词</p>
            <button onClick={() => speakEnglish(question.target.english)} className="mx-auto w-14 h-14 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center active:scale-95 transition-transform"><Volume2 size={24} className="text-[var(--color-primary)]" /></button>
            <p className="text-[12px] text-[var(--color-muted)] mt-3">提示释义：{question.target.chinese}</p>
            {lastCorrect !== null && (
              <p className={`mt-2 text-[13px] font-semibold ${lastCorrect ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {lastCorrect ? '回答正确' : `正确答案：${question.target.english}`}
              </p>
            )}
          </div>

          <div className="mx-5 grid grid-cols-1 md:grid-cols-2 gap-3 pb-8">
            {question.options.map(option => {
              const isSelected = selectedWord === option.english
              const isCorrect = normalizeWord(option.english) === normalizeWord(question.target.english)
              let cls = 'border-[var(--color-border)]'
              if (status === 'feedback' && isSelected && !isCorrect) cls = 'border-[var(--color-error)] bg-[var(--color-error)]/10'
              if (status === 'feedback' && isCorrect) cls = 'border-[var(--color-success)] bg-[var(--color-success)]/10'
              return (
                <button
                  key={`${option.english}-${option.id ?? option.chinese}`}
                  onClick={() => handleChoose(option)}
                  disabled={status !== 'playing'}
                  className={`w-full p-4 rounded-[var(--radius-md)] border text-left bg-[var(--color-card)] transition-all ${cls} disabled:opacity-80`}
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[18px] font-semibold text-[var(--color-foreground)] break-all">{option.english}</p>
                    {status === 'feedback' && isCorrect && <Check size={18} className="text-[var(--color-success)]" />}
                    {status === 'feedback' && isSelected && !isCorrect && <X size={18} className="text-[var(--color-error)]" />}
                  </div>
                  {option.phonetic && <p className="text-[12px] text-[var(--color-muted)] mt-1">{option.phonetic}</p>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
