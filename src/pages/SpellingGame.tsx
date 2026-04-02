import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, RotateCcw, Trophy, Clock, Zap, Volume2, VolumeX, Eye, HelpCircle, Check, X,
} from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { calculateNextReview, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'
import {
  type WordPair,
  shuffleArray,
  calcCorrectScore,
  calcWrongPenalty,
} from '../lib/gameEngine'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { normalizeWhitespace } from '../lib/text'
import { navigateSafely } from '../lib/navigation'
import {
  KEYBOARD_SFX_STORAGE_KEY,
  playKeyboardSuccessSound,
  playKeyboardTapSound,
  getSfxType,
  setSfxType,
  SFX_OPTIONS,
  type SfxType,
} from '../lib/keyboardSfx'

/**
 * 拼写挑战游戏
 *
 * 玩法：
 *   1. 显示中文释义 + 音标
 *   2. 用户在输入框中拼写英文单词
 *   3. 可使用提示：显示首字母 / 显示长度 / 播放发音
 *   4. 提交后逐字对比：正确绿色、错误红色
 *   5. 计分系统：基础分 + 连击 − 扣分（使用提示减少得分）
 */

const WORDS_PER_ROUND = 10 // 每局题数
function normalizeSpellingAttempt(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase()
}

function cloneWordForRetry(word: WordPair): WordPair {
  return { ...word }
}

export default function SpellingGame() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/vocab-game')
  const { user } = useAuth()
  const { vocabulary, fetchVocabulary, loading: vocabLoading, addReview, updateNextReview } = useVocabulary()

  // ===== 游戏数据 =====
  const [words, setWords] = useState<WordPair[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'playing' | 'checking' | 'finished' | 'empty'>('loading')

  // ===== 输入 & 答案 =====
  const [userInput, setUserInput] = useState('')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [lastAttempt, setLastAttempt] = useState('')
  const [showCorrectSpelling, setShowCorrectSpelling] = useState(false)
  const [hasMistypedCurrentWord, setHasMistypedCurrentWord] = useState(false)
  const [queuedRetryForCurrentWord, setQueuedRetryForCurrentWord] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ===== 分数 =====
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const savedRef = useRef(false)

  // ===== 提示状态 =====
  const [showFirstLetter, setShowFirstLetter] = useState(false)
  const [showLength, setShowLength] = useState(false)
  const [hintUsed, setHintUsed] = useState(false) // 用了提示则该题减分
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    const raw = localStorage.getItem(KEYBOARD_SFX_STORAGE_KEY)
    return raw === null ? true : raw === '1'
  })
  const [sfxType, setSfxTypeState] = useState<SfxType>(getSfxType)
  const [showSfxPicker, setShowSfxPicker] = useState(false)

  // 计时器
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const spokenQuestionRef = useRef('')
  const checkingEnteredAtRef = useRef(0)
  const typingSequenceRef = useRef(0)

  const currentWord = words[currentIndex]

  const playTypingSound = useCallback((key: string) => {
    if (!soundEnabled) return
    playKeyboardTapSound(key, typingSequenceRef.current)
    if (key.toLowerCase() === 'backspace') {
      typingSequenceRef.current = Math.max(0, typingSequenceRef.current - 1)
    } else if (/^[a-z]$/i.test(key)) {
      typingSequenceRef.current += 1
    }
  }, [soundEnabled])

  const playSuccessSound = useCallback((isFinal: boolean) => {
    if (!soundEnabled) return
    playKeyboardSuccessSound(isFinal)
  }, [soundEnabled])

  const speakCurrentWord = useCallback(() => {
    if (!currentWord || !soundEnabled) return
    stopSpeaking()
    speakEnglish(currentWord.english, 0.7)
  }, [currentWord, soundEnabled])

  // ===== 初始化游戏 =====
  const initGame = useCallback((source: WordPair[]) => {
    const selected = shuffleArray(source).slice(0, Math.min(WORDS_PER_ROUND, source.length))
    setWords(selected)
    setCurrentIndex(0)
    setUserInput('')
    setIsCorrect(null)
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setCorrectCount(0)
    setElapsed(0)
    setShowFirstLetter(false)
    setShowLength(false)
    setShowCorrectSpelling(false)
    setHasMistypedCurrentWord(false)
    setQueuedRetryForCurrentWord(false)
    setHintUsed(false)
    typingSequenceRef.current = 0
    setStatus('playing')
    savedRef.current = false

    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
  }, [])

  // ===== 下一题 =====
  const handleNext = useCallback(() => {
    if (Date.now() - checkingEnteredAtRef.current < 180) return

    if (currentIndex >= words.length - 1) {
      if (timerRef.current) clearInterval(timerRef.current)
      setStatus('finished')
      return
    }

    setCurrentIndex(prev => prev + 1)
    setUserInput('')
    setIsCorrect(null)
    setLastAttempt('')
    setShowFirstLetter(false)
    setShowLength(false)
    setShowCorrectSpelling(false)
    setHasMistypedCurrentWord(false)
    setQueuedRetryForCurrentWord(false)
    setHintUsed(false)
    setStatus('playing')
  }, [currentIndex, words.length])

  // ===== 初始化词库 =====
  useEffect(() => {
    fetchVocabulary('today')
  }, [fetchVocabulary])

  // ===== 当词库准备好后生成题目 =====
  useEffect(() => {
    if (status !== 'loading') return
    if (vocabLoading) return

    const userWords: WordPair[] = vocabulary
      .filter(v => v.word && v.meaning)
      .map(v => ({
        id: v.id,
        english: v.word,
        chinese: v.meaning || '',
        phonetic: v.phonetic || '',
      }))

    if (userWords.length < 2) {
      window.setTimeout(() => setStatus('empty'), 0)
      return
    }

    window.setTimeout(() => initGame(userWords), 0)
  }, [vocabulary, status, vocabLoading, initGame])

  useEffect(() => {
    async function loadHighScore() {
      if (!user) return
      const { data, error } = await supabase
        .from('game_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('game_type', 'spell')
        .order('score', { ascending: false })
        .limit(1)
      if (!error && data && data.length > 0) {
        setHighScore(data[0].score || 0)
      }
    }
    loadHighScore()
  }, [user])

  // 清理计时器
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  useEffect(() => {
    localStorage.setItem(KEYBOARD_SFX_STORAGE_KEY, soundEnabled ? '1' : '0')
  }, [soundEnabled])

  // 每题开始时聚焦输入框
  useEffect(() => {
    if (status === 'playing') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [currentIndex, status])

  useEffect(() => {
    if (status !== 'checking') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      handleNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status, handleNext])

  useEffect(() => {
    if (status !== 'playing' || !currentWord) return
    const speakKey = `${currentIndex}:${currentWord.english}`
    if (spokenQuestionRef.current === speakKey) return
    spokenQuestionRef.current = speakKey
    speakCurrentWord()
  }, [currentIndex, currentWord, speakCurrentWord, status])

  // ===== 提交答案 =====
  const handleSubmit = useCallback(() => {
    const liveInput = inputRef.current?.value ?? userInput
    if (!currentWord || status !== 'playing' || !liveInput.trim()) return

    const answer = normalizeSpellingAttempt(currentWord.english)
    const input = normalizeSpellingAttempt(liveInput)
    const correct = answer === input
    const shouldRetryLater = hasMistypedCurrentWord || showCorrectSpelling

    setUserInput(liveInput)
    setLastAttempt(liveInput.trim())
    setIsCorrect(correct)

    if (correct) {
      checkingEnteredAtRef.current = Date.now()
      setStatus('checking')
      setQueuedRetryForCurrentWord(shouldRetryLater)

      if (shouldRetryLater) {
        setWords((prev) => [...prev, cloneWordForRetry(currentWord)])
        setCombo(0)
      } else {
        const newCombo = combo + 1
        // 使用了提示则只拿一半分
        const points = hintUsed
          ? Math.floor(calcCorrectScore(newCombo) / 2)
          : calcCorrectScore(newCombo)
        setScore(prev => prev + points)
        setCombo(newCombo)
        setMaxCombo(prev => Math.max(prev, newCombo))
        setCorrectCount(prev => prev + 1)

        if (typeof currentWord.id === 'number') {
          const current = vocabulary.find(v => v.id === currentWord.id)
          if (current) {
            const cycle = getReviewCycleDaysFromLocalStorage()
            const review = calculateNextReview(current.mastery_level, 'known', cycle)
            addReview(current.id, 'known', 'game').catch(() => {})
            updateNextReview(current.id, review.nextReviewAt, (current.review_count || 0) + 1, review.newMastery).catch(() => {})
          }
        }
      }

      playSuccessSound(currentIndex >= words.length - 1)
    } else {
      setHasMistypedCurrentWord(true)
      setQueuedRetryForCurrentWord(false)
      setScore(prev => Math.max(0, prev + calcWrongPenalty()))
      setCombo(0)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [currentWord, status, userInput, combo, hintUsed, vocabulary, addReview, updateNextReview, playSuccessSound, currentIndex, words.length])

  // ===== 重新开始 =====
  const handleRestart = () => {
    setLastAttempt('')
    setUserInput('')
    setIsCorrect(null)
    setShowCorrectSpelling(false)
    setHasMistypedCurrentWord(false)
    setQueuedRetryForCurrentWord(false)
    setStatus('loading')
  }

  // ===== 游戏结束时保存记录 =====
  useEffect(() => {
    if (status === 'finished' && !savedRef.current) {
      savedRef.current = true

      if (user) {
        const practicedWords = words
          .map(w => w.english?.trim().toLowerCase())
          .filter((w): w is string => Boolean(w))

        supabase.from('game_scores').insert({
          user_id: user.id,
          game_type: 'spell',
          score,
          duration_seconds: elapsed,
          words_practiced: practicedWords,
        }).then(({ error }) => {
          if (error) {
            console.error('[game_scores] spell insert failed:', error.message)
            return
          }
          if (score > highScore) {
            setHighScore(score)
          }
        })
      }
    }
  }, [status, user, score, elapsed, words, highScore])

  // ===== 播放发音 =====
  const handleSpeak = () => {
    if (currentWord) {
      stopSpeaking()
      speakEnglish(currentWord.english, 0.7)
    }
  }

  // ===== 格式化时间 =====
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ===== 逐字对比渲染 =====
  const renderLetterComparison = () => {
    if (!currentWord || isCorrect === null) return null
    const answer = currentWord.english.toLowerCase()
    const input = (isCorrect ? userInput : lastAttempt).toLowerCase()
    const maxLen = Math.max(answer.length, input.length)

    return (
      <div className="flex flex-wrap gap-1 justify-center mt-3">
        {Array.from({ length: maxLen }).map((_, i) => {
          const expected = answer[i] || ''
          const typed = input[i] || ''
          const match = expected === typed
          return (
            <span
              key={i}
              className={`w-8 h-10 flex items-center justify-center text-[16px] font-bold rounded-[6px] border-2 ${
                match
                  ? 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-success)]'
                  : 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-error)]'
              }`}
            >
              {typed || '_'}
            </span>
          )
        })}
      </div>
    )
  }

  // ===== 加载画面 =====
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[14px] text-[var(--color-muted)]">正在加载题目...</p>
        </div>
      </div>
    )
  }

  if (status === 'empty') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[18px] font-bold text-[var(--color-foreground)] mb-2">今日学习词不足，无法开始游戏</p>
        <p className="text-[13px] text-[var(--color-muted)] mb-5">今天至少需要 2 个已释放词汇；去词库或学习集增加今日新词后再来。</p>
        <button
          onClick={() => navigateSafely(navigate, '/app/vocab')}
          className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold"
        >
          前往词库
        </button>
      </div>
    )
  }

  // ===== 结算画面 =====
  if (status === 'finished') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8">
        <Trophy size={64} className="text-[var(--color-primary)] mb-4" />
        <h1 className="text-[28px] font-bold text-[var(--color-foreground)] mb-2">拼写完成!</h1>
        <p className="text-[14px] text-[var(--color-muted)] mb-8">
          正确率 {Math.round((correctCount / words.length) * 100)}%
        </p>

        <div className="w-full max-w-[300px] bg-[var(--color-card)] rounded-[var(--radius-lg)] p-6 mb-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-center mb-4">
            <p className="text-[40px] font-bold text-[var(--color-primary)]">{score}</p>
            <p className="text-[12px] text-[var(--color-muted)]">总分</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[18px] font-bold text-[var(--color-foreground)]">{correctCount}/{words.length}</p>
              <p className="text-[10px] text-[var(--color-muted)]">正确</p>
            </div>
            <div>
              <p className="text-[18px] font-bold text-[var(--color-foreground)]">{maxCombo}x</p>
              <p className="text-[10px] text-[var(--color-muted)]">最高连击</p>
            </div>
            <div>
              <p className="text-[18px] font-bold text-[var(--color-foreground)]">{formatTime(elapsed)}</p>
              <p className="text-[10px] text-[var(--color-muted)]">用时</p>
            </div>
          </div>
          {score > highScore && highScore > 0 && (
            <p className="text-center text-[12px] text-[var(--color-primary)] font-semibold mt-3">🎉 新纪录!</p>
          )}
        </div>

        <div className="flex gap-3 w-full max-w-[300px]">
          <button onClick={goBack} className="flex-1 py-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-[var(--color-foreground)]">
            返回
          </button>
          <button onClick={handleRestart} className="flex-1 py-3 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-white flex items-center justify-center gap-2">
            <RotateCcw size={16} /> 再来一局
          </button>
        </div>
      </div>
    )
  }

  // ===== 游戏主界面 =====
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">拼写挑战</h1>
        <div className="relative flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`p-1.5 rounded-full ${soundEnabled ? 'bg-[var(--color-primary-light)]' : 'bg-[var(--color-background-secondary)]'}`}
            title={soundEnabled ? '音效已开启' : '音效已关闭'}
          >
            {soundEnabled
              ? <Volume2 size={16} className="text-[var(--color-primary)]" />
              : <VolumeX size={16} className="text-[var(--color-muted)]" />}
          </button>
          {soundEnabled && (
            <button
              onClick={() => setShowSfxPicker(p => !p)}
              className="rounded-full bg-[var(--color-primary)] px-2 py-1 text-[10px] text-white"
              title="切换音色"
            >
              {SFX_OPTIONS.find(o => o.value === sfxType)?.emoji?.slice(0, 2) || '🎹'}
            </button>
          )}
          <span className="text-[13px] text-[var(--color-muted)]">{currentIndex + 1}/{words.length}</span>
          {showSfxPicker && soundEnabled && (
            <div className="absolute right-0 top-full z-50 mt-2 w-36 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-1.5 shadow-xl">
              {SFX_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSfxTypeState(opt.value)
                    setSfxType(opt.value)
                    setShowSfxPicker(false)
                    playKeyboardTapSound('e', 0)
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors ${
                    sfxType === opt.value
                      ? 'bg-[var(--color-primary-light)] font-semibold text-[var(--color-primary)]'
                      : 'text-[var(--color-foreground)] hover:bg-[var(--color-background-secondary)]'
                  }`}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 进度条 */}
      <div className="mx-5 mb-4 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }} />
      </div>

      {/* 状态栏 */}
      <div className="mx-5 mb-4 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-1.5 bg-[var(--color-card)] px-3 py-2 rounded-[var(--radius-sm)]">
          <Trophy size={14} className="text-[var(--color-primary)]" />
          <span className="text-[14px] font-bold text-[var(--color-foreground)]">{score}</span>
        </div>
        {combo > 0 && (
          <div className="flex items-center gap-1.5 bg-[var(--color-primary-light)] px-3 py-2 rounded-[var(--radius-sm)]">
            <Zap size={14} className="text-[var(--color-primary)]" />
            <span className="text-[14px] font-bold text-[var(--color-primary)]">{combo}x</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 bg-[var(--color-card)] px-3 py-2 rounded-[var(--radius-sm)]">
          <Clock size={14} className="text-[var(--color-muted)]" />
          <span className="text-[14px] text-[var(--color-foreground)]">{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* 题目区域 */}
      {currentWord && (
        <div className="mx-5 mb-6 p-6 bg-[var(--color-card)] rounded-[var(--radius-lg)] text-center" style={{ boxShadow: 'var(--shadow-card)' }}>
          {/* 中文释义 */}
          <p className="text-[24px] font-bold text-[var(--color-foreground)] mb-2">{currentWord.chinese}</p>
          {/* 音标 */}
          {currentWord.phonetic && (
            <p className="text-[14px] text-[var(--color-muted)] mb-3">{currentWord.phonetic}</p>
          )}
          {/* 提示信息 */}
          <div className="flex items-center justify-center gap-4 text-[12px] text-[var(--color-muted)]">
            {showLength && <span>长度: {currentWord.english.length} 个字母</span>}
            {showFirstLetter && <span>首字母: {currentWord.english[0].toUpperCase()}</span>}
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="mx-5 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={userInput}
          onChange={e => {
            const nextValue = e.target.value
            if (isCorrect !== null || lastAttempt) {
              setIsCorrect(null)
              setLastAttempt('')
            }
            setUserInput(nextValue)
          }}
          onKeyDown={e => {
            if (status === 'playing' && soundEnabled) {
              if (e.key === 'Backspace') {
                playTypingSound('backspace')
              } else if (/^[a-zA-Z]$/.test(e.key)) {
                playTypingSound(e.key)
              }
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              if (status === 'checking') handleNext()
              else handleSubmit()
            }
          }}
          disabled={status === 'checking'}
          placeholder="在此输入英文单词..."
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-[var(--color-background-secondary)] rounded-[var(--radius-md)] px-4 py-4 text-center text-[20px] font-semibold text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none tracking-widest disabled:opacity-60"
        />

        {/* 检查状态下显示逐字对比 */}
        {(status === 'checking' || isCorrect === false) && renderLetterComparison()}

        {/* 正确/错误提示 */}
        {(status === 'checking' || isCorrect === false) && (
          <div className={`mt-3 p-3 rounded-[var(--radius-sm)] flex items-center justify-center gap-2 ${
            isCorrect
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
          }`}>
            {isCorrect ? <Check size={16} /> : <X size={16} />}
            <span className="text-[14px] font-semibold">
              {isCorrect
                ? queuedRetryForCurrentWord
                  ? '本次已纠正，但因出现过错误，已加入后续重新拼写'
                  : '拼写正确，按回车进入下一题'
                : '拼错了，请重新拼写直到成功'}
            </span>
          </div>
        )}

        {showCorrectSpelling && currentWord && (
          <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--color-primary-light)]/80 px-4 py-3 text-center">
            <p className="text-[12px] text-[var(--color-muted)]">正确拼写</p>
            <p className="mt-1 text-[20px] font-bold tracking-[0.22em] text-[var(--color-primary)]">
              {currentWord.english.toUpperCase()}
            </p>
            <p className="mt-2 text-[12px] text-[var(--color-muted)]">
              已查看答案，仍需自己重新完整拼对，才算通过今天这次复习。
            </p>
          </div>
        )}
      </div>

      {/* 提示按钮行 */}
      {status === 'playing' && (
        <div className="mx-5 mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <button
            onClick={handleSpeak}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)]"
          >
            <Volume2 size={14} /> 听发音
          </button>
          <button
            onClick={() => { setShowFirstLetter(true); setHintUsed(true) }}
            disabled={showFirstLetter}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)] disabled:opacity-40"
          >
            <Eye size={14} /> 首字母
          </button>
          <button
            onClick={() => { setShowLength(true); setHintUsed(true) }}
            disabled={showLength}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)] disabled:opacity-40"
          >
            <HelpCircle size={14} /> 显示长度
          </button>
          <button
            onClick={() => {
              setShowCorrectSpelling(true)
              setHintUsed(true)
              window.setTimeout(() => inputRef.current?.focus(), 30)
            }}
            disabled={showCorrectSpelling}
            className="flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)] disabled:opacity-40"
          >
            <Eye size={14} /> 正确拼写
          </button>
        </div>
      )}

      {/* 底部操作按钮 */}
      <div className="mt-auto px-5 py-4">
        {status === 'playing' ? (
          <button
            onClick={handleSubmit}
            disabled={!userInput.trim()}
            className="w-full py-3.5 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[16px] font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {hasMistypedCurrentWord || showCorrectSpelling
              ? '重新拼写并提交'
              : isCorrect === false
                ? '重新提交'
                : '确认提交'}
          </button>
        ) : status === 'checking' ? (
          <button
            onClick={handleNext}
            className="w-full py-3.5 bg-[var(--color-primary)] rounded-[var(--radius-sm)] text-[16px] font-semibold text-white active:scale-[0.98] transition-transform"
          >
            {currentIndex >= words.length - 1 ? '查看结果' : '下一题'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
