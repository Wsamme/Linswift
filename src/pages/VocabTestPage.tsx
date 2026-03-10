import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, X, Volume2 } from 'lucide-react'
import { speakEnglish } from '../lib/tts'

/**
 * 词汇量测试 —— 词汇测试模块
 * 功能：
 *  1. 随机词汇卡片
 *  2. "会" / "不会" 按钮
 *  3. 顶部实时更新预估词汇量（橙色大字）
 */

// ===== 测试词汇池（从简到难，混合随机）=====
const wordPool = [
  { word: 'book', level: 1 }, { word: 'happy', level: 1 }, { word: 'water', level: 1 },
  { word: 'describe', level: 2 }, { word: 'knowledge', level: 2 }, { word: 'decision', level: 2 },
  { word: 'significant', level: 3 }, { word: 'opportunity', level: 3 }, { word: 'communicate', level: 3 },
  { word: 'elaborate', level: 4 }, { word: 'phenomenon', level: 4 }, { word: 'comprehensive', level: 4 },
  { word: 'ubiquitous', level: 5 }, { word: 'paradigm', level: 5 }, { word: 'ephemeral', level: 5 },
  { word: 'supercilious', level: 6 }, { word: 'pulchritudinous', level: 6 }, { word: 'sesquipedalian', level: 6 },
]

// 每个等级对应的基础词汇量估算
const levelEstimate: Record<number, number> = {
  1: 500, 2: 1500, 3: 3000, 4: 5000, 5: 8000, 6: 12000,
}

export default function VocabTestPage() {
  const navigate = useNavigate()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [knownCount, setKnownCount] = useState(0)
  const [totalAnswered, setTotalAnswered] = useState(0)

  // 随机打乱词汇
  const shuffledWords = useMemo(() => {
    return [...wordPool].sort(() => Math.random() - 0.5)
  }, [])

  const isFinished = currentIndex >= shuffledWords.length
  const currentWord = shuffledWords[currentIndex]

  // ===== 动态估算词汇量 =====
  // 简单算法：根据答对的比例和当前测试到的词汇难度来估算
  const estimatedVocab = useMemo(() => {
    if (totalAnswered === 0) return 4200 // 默认初始值
    const ratio = knownCount / totalAnswered
    // 找到当前测试到的最高难度
    const maxLevel = currentIndex < shuffledWords.length
      ? shuffledWords[currentIndex]?.level || 3
      : shuffledWords[shuffledWords.length - 1]?.level || 3
    const baseEstimate = levelEstimate[maxLevel] || 3000
    return Math.round(baseEstimate * ratio)
  }, [knownCount, totalAnswered, currentIndex, shuffledWords])

  // ===== 处理选择 =====
  const handleAnswer = (known: boolean) => {
    if (known) setKnownCount(prev => prev + 1)
    setTotalAnswered(prev => prev + 1)
    setCurrentIndex(prev => prev + 1)
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">词汇量测试</h1>
        <span className="text-[13px] text-[var(--color-muted)]">
          {Math.min(currentIndex + 1, shuffledWords.length)}/{shuffledWords.length}
        </span>
      </div>

      {/* ===== 预估词汇量（实时更新）===== */}
      <div className="flex flex-col items-center mb-4">
        <p className="text-[12px] text-[var(--color-muted)] mb-1">预估词汇量</p>
        <p className="text-[42px] font-bold text-[var(--color-primary)] leading-none">
          {estimatedVocab.toLocaleString()}
        </p>
      </div>

      {/* ===== 进度条 ===== */}
      <div className="mx-5 mb-6 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${(currentIndex / shuffledWords.length) * 100}%` }} />
      </div>

      {isFinished ? (
        /* ===== 测试完成 ===== */
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <span className="text-[48px] mb-4">🎉</span>
          <h2 className="text-[22px] font-bold text-[var(--color-foreground)] mb-2">测试完成！</h2>
          <p className="text-[14px] text-[var(--color-muted)] mb-2">
            你认识 {knownCount}/{shuffledWords.length} 个单词
          </p>
          <p className="text-[16px] text-[var(--color-foreground)] mb-1">预估词汇量</p>
          <p className="text-[56px] font-bold text-[var(--color-primary)] leading-none mb-6">
            {estimatedVocab.toLocaleString()}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold active:scale-[0.98] transition-transform"
          >
            返回词库
          </button>
        </div>
      ) : (
        <>
          {/* ===== 单词卡片 ===== */}
          <div className="flex-1 flex items-center justify-center px-8">
            <div
              className="w-full max-w-[300px] bg-[var(--color-card)] rounded-[var(--radius-lg)] p-8 text-center border border-[var(--color-border)]"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              {/* 难度标签 */}
              <div className="flex justify-center mb-4">
                <span className="text-[10px] px-2 py-0.5 bg-[var(--color-background-secondary)] rounded-full text-[var(--color-muted)]">
                  Level {currentWord.level}
                </span>
              </div>
              {/* 单词 */}
              <h2 className="text-[32px] font-bold text-[var(--color-foreground)] mb-4">
                {currentWord.word}
              </h2>
              {/* 发音按钮 —— 点击朗读当前单词 */}
              <button
                className="p-2.5 rounded-full bg-[var(--color-primary-light)] mb-2 active:scale-90 transition-transform"
                onClick={() => speakEnglish(currentWord.word)}
              >
                <Volume2 size={20} className="text-[var(--color-primary)]" />
              </button>
              <p className="text-[12px] text-[var(--color-muted)]">你认识这个单词吗？</p>
            </div>
          </div>

          {/* ===== 底部按钮 ===== */}
          <div className="px-8 py-6 flex gap-6 justify-center">
            {/* 不会 */}
            <button
              onClick={() => handleAnswer(false)}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="w-16 h-16 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center active:scale-90 transition-transform border-2 border-[var(--color-error)]/20">
                <X size={28} className="text-[var(--color-error)]" />
              </div>
              <span className="text-[12px] text-[var(--color-muted)]">不认识</span>
            </button>
            {/* 会 */}
            <button
              onClick={() => handleAnswer(true)}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center active:scale-90 transition-transform border-2 border-[var(--color-success)]/20">
                <Check size={28} className="text-[var(--color-success)]" />
              </div>
              <span className="text-[12px] text-[var(--color-muted)]">认识</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
