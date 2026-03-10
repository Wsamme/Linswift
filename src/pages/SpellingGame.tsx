import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, RotateCcw, Trophy, Clock, Zap, Volume2, Eye, HelpCircle, Check, X,
} from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import {
  type WordPair,
  shuffleArray,
  calcCorrectScore,
  calcWrongPenalty,
  saveGameRecord,
  getHighScore,
  FALLBACK_WORDS,
} from '../lib/gameEngine'

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

export default function SpellingGame() {
  const navigate = useNavigate()
  const { vocabulary, fetchVocabulary } = useVocabulary()

  // ===== 游戏数据 =====
  const [words, setWords] = useState<WordPair[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [status, setStatus] = useState<'loading' | 'playing' | 'checking' | 'finished'>('loading')

  // ===== 输入 & 答案 =====
  const [userInput, setUserInput] = useState('')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ===== 分数 =====
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [highScore] = useState(() => getHighScore('spelling'))

  // ===== 提示状态 =====
  const [showFirstLetter, setShowFirstLetter] = useState(false)
  const [showLength, setShowLength] = useState(false)
  const [hintUsed, setHintUsed] = useState(false) // 用了提示则该题减分

  // 计时器
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentWord = words[currentIndex]

  // ===== 初始化词库 =====
  useEffect(() => {
    fetchVocabulary('all')
  }, [fetchVocabulary])

  // ===== 当词库准备好后生成题目 =====
  useEffect(() => {
    if (status !== 'loading') return

    const userWords: WordPair[] = vocabulary
      .filter(v => v.word && v.meaning)
      .map(v => ({
        id: v.id,
        english: v.word,
        chinese: v.meaning || '',
        phonetic: v.phonetic || '',
      }))

    const source = userWords.length >= WORDS_PER_ROUND ? userWords : FALLBACK_WORDS
    initGame(source)
  }, [vocabulary, status])

  // ===== 初始化游戏 =====
  const initGame = (source: WordPair[]) => {
    const selected = shuffleArray(source).slice(0, WORDS_PER_ROUND)
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
    setHintUsed(false)
    setStatus('playing')

    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
  }

  // 清理计时器
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // 每题开始时聚焦输入框
  useEffect(() => {
    if (status === 'playing') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [currentIndex, status])

  // ===== 提交答案 =====
  const handleSubmit = useCallback(() => {
    if (!currentWord || status !== 'playing' || !userInput.trim()) return

    const answer = currentWord.english.toLowerCase().trim()
    const input = userInput.toLowerCase().trim()
    const correct = answer === input

    setIsCorrect(correct)
    setStatus('checking')

    if (correct) {
      const newCombo = combo + 1
      // 使用了提示则只拿一半分
      const points = hintUsed
        ? Math.floor(calcCorrectScore(newCombo) / 2)
        : calcCorrectScore(newCombo)
      setScore(prev => prev + points)
      setCombo(newCombo)
      setMaxCombo(prev => Math.max(prev, newCombo))
      setCorrectCount(prev => prev + 1)
    } else {
      setScore(prev => Math.max(0, prev + calcWrongPenalty()))
      setCombo(0)
    }
  }, [currentWord, status, userInput, combo, hintUsed])

  // ===== 下一题 =====
  const handleNext = () => {
    if (currentIndex >= words.length - 1) {
      // 最后一题 → 结算
      if (timerRef.current) clearInterval(timerRef.current)
      setStatus('finished')
      saveGameRecord({
        gameType: 'spelling',
        score,
        date: new Date().toISOString(),
        maxCombo,
        correctCount,
        totalCount: words.length,
      })
      return
    }

    // 进入下一题
    setCurrentIndex(prev => prev + 1)
    setUserInput('')
    setIsCorrect(null)
    setShowFirstLetter(false)
    setShowLength(false)
    setHintUsed(false)
    setStatus('playing')
  }

  // ===== 重新开始 =====
  const handleRestart = () => setStatus('loading')

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
    const input = userInput.toLowerCase()
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
          <button onClick={() => navigate(-1)} className="flex-1 py-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[14px] font-semibold text-[var(--color-foreground)]">
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
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">拼写挑战</h1>
        <span className="text-[13px] text-[var(--color-muted)]">{currentIndex + 1}/{words.length}</span>
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
          onChange={e => setUserInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
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
        {status === 'checking' && renderLetterComparison()}

        {/* 正确/错误提示 */}
        {status === 'checking' && (
          <div className={`mt-3 p-3 rounded-[var(--radius-sm)] flex items-center justify-center gap-2 ${
            isCorrect
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
          }`}>
            {isCorrect ? <Check size={16} /> : <X size={16} />}
            <span className="text-[14px] font-semibold">
              {isCorrect ? '拼写正确!' : `正确答案: ${currentWord?.english}`}
            </span>
          </div>
        )}
      </div>

      {/* 提示按钮行 */}
      {status === 'playing' && (
        <div className="mx-5 mb-4 flex gap-2">
          <button
            onClick={handleSpeak}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)]"
          >
            <Volume2 size={14} /> 听发音
          </button>
          <button
            onClick={() => { setShowFirstLetter(true); setHintUsed(true) }}
            disabled={showFirstLetter}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)] disabled:opacity-40"
          >
            <Eye size={14} /> 首字母
          </button>
          <button
            onClick={() => { setShowLength(true); setHintUsed(true) }}
            disabled={showLength}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] text-[12px] text-[var(--color-foreground)] disabled:opacity-40"
          >
            <HelpCircle size={14} /> 显示长度
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
            确认提交
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
