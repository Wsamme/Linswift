import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, RotateCcw, Trophy, Clock, Zap,
} from 'lucide-react'
import { useVocabulary } from '../hooks/useVocabulary'
import {
  type WordPair,
  shuffleArray,
  generatePairs,
  calcCorrectScore,
  calcWrongPenalty,
  calcTimeBonus,
} from '../lib/gameEngine'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'

/**
 * 单词连连看游戏
 *
 * 玩法：
 *   1. 左列显示英文单词，右列显示中文释义（乱序）
 *   2. 用户先点击左列一个单词，再点击右列对应释义
 *   3. 匹配成功 → 绿色 + 消失动画 + 加分 + 连击
 *   4. 匹配失败 → 红色抖动 + 扣分 + 连击归零
 *   5. 全部配对完成 → 结算页面（分数 + 时间 + 连击）
 *
 * 数据来源：用户词库（Supabase） / 内置备用词库
 */

// 每局使用的配对数量
const PAIRS_PER_ROUND = 8

/** 卡片类型：左列(英) 或 右列(中) */
interface Card {
  id: string         // 唯一标识
  text: string       // 显示文本
  pairId: string     // 配对标识（同一对的英/中共享）
  side: 'english' | 'chinese'
  matched: boolean   // 是否已配对成功
  wrong: boolean     // 是否正在错误动画中
}

export default function WordMatchGame() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/vocab-game')
  const { user } = useAuth()
  const { vocabulary, fetchVocabulary, loading: vocabLoading } = useVocabulary()

  // ===== 游戏状态 =====
  const [status, setStatus] = useState<'loading' | 'playing' | 'finished' | 'empty'>('loading')
  const [leftCards, setLeftCards] = useState<Card[]>([])    // 左列（英文）
  const [rightCards, setRightCards] = useState<Card[]>([])  // 右列（中文）
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)   // 选中的左列 ID
  const [selectedRight, setSelectedRight] = useState<string | null>(null) // 选中的右列 ID
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [totalPairs, setTotalPairs] = useState(0)
  const [elapsed, setElapsed] = useState(0)   // 游戏用时（秒）
  const [highScore, setHighScore] = useState(0)
  const savedRef = useRef(false)

  // 计时器
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ===== 初始化：加载词库 & 生成卡片 =====
  useEffect(() => {
    fetchVocabulary('all')
  }, [fetchVocabulary])

  // 当词库数据准备好后，初始化游戏
  useEffect(() => {
    if (status !== 'loading') return
    if (vocabLoading) return

    // 将用户词库转换为 WordPair
    const userWords: WordPair[] = vocabulary
      .filter(v => v.word && v.meaning)
      .map(v => ({
        id: v.id,
        english: v.word,
        chinese: v.meaning || '',
        phonetic: v.phonetic || '',
      }))

    if (userWords.length < 2) {
      setStatus('empty')
      return
    }

    initGame(userWords)
  }, [vocabulary, status, vocabLoading])

  useEffect(() => {
    async function loadHighScore() {
      if (!user) return
      const { data, error } = await supabase
        .from('game_scores')
        .select('score')
        .eq('user_id', user.id)
        .eq('game_type', 'match')
        .order('score', { ascending: false })
        .limit(1)
      if (!error && data && data.length > 0) {
        setHighScore(data[0].score || 0)
      }
    }
    loadHighScore()
  }, [user])

  // ===== 初始化游戏 =====
  const initGame = (source: WordPair[]) => {
    const pairs = generatePairs(source, Math.min(PAIRS_PER_ROUND, source.length))
    setTotalPairs(pairs.length)

    // 生成左列卡片（英文，乱序）
    const left: Card[] = shuffleArray(
      pairs.map((p, i) => ({
        id: `en-${i}`,
        text: p.english,
        pairId: `pair-${i}`,
        side: 'english' as const,
        matched: false,
        wrong: false,
      }))
    )

    // 生成右列卡片（中文，乱序）
    const right: Card[] = shuffleArray(
      pairs.map((p, i) => ({
        id: `zh-${i}`,
        text: p.chinese,
        pairId: `pair-${i}`,
        side: 'chinese' as const,
        matched: false,
        wrong: false,
      }))
    )

    setLeftCards(left)
    setRightCards(right)
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setMatchedCount(0)
    setElapsed(0)
    setSelectedLeft(null)
    setSelectedRight(null)
    setStatus('playing')
    savedRef.current = false

    // 启动计时器
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
  }

  // ===== 清理计时器 =====
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ===== 检查配对 =====
  const checkMatch = useCallback((leftId: string, rightId: string) => {
    const left = leftCards.find(c => c.id === leftId)
    const right = rightCards.find(c => c.id === rightId)
    if (!left || !right) return

    if (left.pairId === right.pairId) {
      // ✅ 配对成功
      const newCombo = combo + 1
      const points = calcCorrectScore(newCombo)
      setScore(prev => prev + points)
      setCombo(newCombo)
      setMaxCombo(prev => Math.max(prev, newCombo))
      setMatchedCount(prev => {
        const next = prev + 1
        // 全部配对完成 → 结算
        if (next >= totalPairs) {
          if (timerRef.current) clearInterval(timerRef.current)
          setTimeout(() => setStatus('finished'), 500)
        }
        return next
      })

      // 标记已匹配（绿色 → 消失）
      setLeftCards(prev => prev.map(c => c.id === leftId ? { ...c, matched: true } : c))
      setRightCards(prev => prev.map(c => c.id === rightId ? { ...c, matched: true } : c))
    } else {
      // ❌ 配对失败
      setScore(prev => Math.max(0, prev + calcWrongPenalty()))
      setCombo(0)

      // 播放抖动动画
      setLeftCards(prev => prev.map(c => c.id === leftId ? { ...c, wrong: true } : c))
      setRightCards(prev => prev.map(c => c.id === rightId ? { ...c, wrong: true } : c))

      // 500ms 后清除错误动画
      setTimeout(() => {
        setLeftCards(prev => prev.map(c => c.id === leftId ? { ...c, wrong: false } : c))
        setRightCards(prev => prev.map(c => c.id === rightId ? { ...c, wrong: false } : c))
      }, 500)
    }

    // 清除选中状态
    setSelectedLeft(null)
    setSelectedRight(null)
  }, [leftCards, rightCards, combo, totalPairs])

  // ===== 当两侧都选中时，自动检查配对 =====
  useEffect(() => {
    if (selectedLeft && selectedRight) {
      // 延迟一帧让 UI 先更新选中状态
      const timer = setTimeout(() => checkMatch(selectedLeft, selectedRight), 200)
      return () => clearTimeout(timer)
    }
  }, [selectedLeft, selectedRight, checkMatch])

  // ===== 点击左列卡片 =====
  const handleLeftClick = (card: Card) => {
    if (card.matched || status !== 'playing') return
    setSelectedLeft(card.id)
  }

  // ===== 点击右列卡片 =====
  const handleRightClick = (card: Card) => {
    if (card.matched || status !== 'playing') return
    setSelectedRight(card.id)
  }

  // ===== 重新开始 =====
  const handleRestart = () => {
    setStatus('loading')
  }

  // ===== 游戏结束时保存记录 =====
  useEffect(() => {
    if (status === 'finished' && !savedRef.current) {
      savedRef.current = true
      const timeBonus = calcTimeBonus(totalPairs * 15, elapsed)
      const finalScore = score + timeBonus
      setScore(finalScore)

      if (user) {
        supabase.from('game_scores').insert({
          user_id: user.id,
          game_type: 'match',
          score: finalScore,
          duration_seconds: elapsed,
          words_practiced: [],
        }).then(({ error }) => {
          if (error) {
            console.error('[game_scores] match insert failed:', error.message)
            return
          }
          if (finalScore > highScore) {
            setHighScore(finalScore)
          }
        })
      }
    }
  }, [status, totalPairs, elapsed, score, maxCombo, matchedCount, user, highScore])

  // ===== 格式化时间 =====
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ===== 加载画面 =====
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[14px] text-[var(--color-muted)]">正在加载词库...</p>
        </div>
      </div>
    )
  }

  if (status === 'empty') {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8 text-center">
        <p className="text-[18px] font-bold text-[var(--color-foreground)] mb-2">词库不足，无法开始游戏</p>
        <p className="text-[13px] text-[var(--color-muted)] mb-5">请先在翻译或阅读中收集至少 2 个词汇</p>
        <button
          onClick={() => navigate('/app/vocab')}
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
        <h1 className="text-[28px] font-bold text-[var(--color-foreground)] mb-2">游戏结束!</h1>
        <p className="text-[14px] text-[var(--color-muted)] mb-8">全部配对完成</p>

        {/* 分数卡片 */}
        <div className="w-full max-w-[300px] bg-[var(--color-card)] rounded-[var(--radius-lg)] p-6 mb-6" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="text-center mb-4">
            <p className="text-[40px] font-bold text-[var(--color-primary)]">{score}</p>
            <p className="text-[12px] text-[var(--color-muted)]">总分</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[18px] font-bold text-[var(--color-foreground)]">{matchedCount}/{totalPairs}</p>
              <p className="text-[10px] text-[var(--color-muted)]">正确配对</p>
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

        {/* 操作按钮 */}
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
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">单词连连看</h1>
        <span className="text-[13px] text-[var(--color-muted)]">{matchedCount}/{totalPairs}</span>
      </div>

      {/* 状态栏：分数、连击、时间 */}
      <div className="mx-5 mb-4 flex items-center gap-3">
        <div className="flex-1 flex items-center gap-1.5 bg-[var(--color-card)] px-3 py-2 rounded-[var(--radius-sm)]">
          <Trophy size={14} className="text-[var(--color-primary)]" />
          <span className="text-[14px] font-bold text-[var(--color-foreground)]">{score}</span>
        </div>
        {combo > 0 && (
          <div className="flex items-center gap-1.5 bg-[var(--color-primary-light)] px-3 py-2 rounded-[var(--radius-sm)] animate-bounce">
            <Zap size={14} className="text-[var(--color-primary)]" />
            <span className="text-[14px] font-bold text-[var(--color-primary)]">{combo}x</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 bg-[var(--color-card)] px-3 py-2 rounded-[var(--radius-sm)]">
          <Clock size={14} className="text-[var(--color-muted)]" />
          <span className="text-[14px] text-[var(--color-foreground)]">{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* 配对区域：左列英文 + 右列中文 */}
      <div className="flex-1 px-5 flex gap-3">
        {/* 左列 —— 英文 */}
        <div className="flex-1 space-y-2">
          {leftCards.map(card => (
            <button
              key={card.id}
              onClick={() => handleLeftClick(card)}
              disabled={card.matched}
              className={`w-full py-3 px-3 rounded-[var(--radius-sm)] text-[14px] font-semibold transition-all ${
                card.matched
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] scale-95 opacity-50'
                  : card.wrong
                  ? 'bg-[var(--color-error)]/10 text-[var(--color-error)] animate-[shake_0.3s_ease-in-out]'
                  : selectedLeft === card.id
                  ? 'bg-[var(--color-primary)] text-white shadow-lg scale-[1.02]'
                  : 'bg-[var(--color-card)] text-[var(--color-foreground)] active:scale-95'
              }`}
              style={{ boxShadow: card.matched ? 'none' : 'var(--shadow-card)' }}
            >
              {card.text}
            </button>
          ))}
        </div>

        {/* 右列 —— 中文 */}
        <div className="flex-1 space-y-2">
          {rightCards.map(card => (
            <button
              key={card.id}
              onClick={() => handleRightClick(card)}
              disabled={card.matched}
              className={`w-full py-3 px-3 rounded-[var(--radius-sm)] text-[14px] font-semibold transition-all ${
                card.matched
                  ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] scale-95 opacity-50'
                  : card.wrong
                  ? 'bg-[var(--color-error)]/10 text-[var(--color-error)] animate-[shake_0.3s_ease-in-out]'
                  : selectedRight === card.id
                  ? 'bg-[var(--color-primary)] text-white shadow-lg scale-[1.02]'
                  : 'bg-[var(--color-card)] text-[var(--color-foreground)] active:scale-95'
              }`}
              style={{ boxShadow: card.matched ? 'none' : 'var(--shadow-card)' }}
            >
              {card.text}
            </button>
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div className="px-5 py-3 text-center">
        <p className="text-[11px] text-[var(--color-muted)]">
          先点击左列英文，再点击右列对应中文释义
        </p>
      </div>
    </div>
  )
}
