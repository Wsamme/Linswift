import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * 阅读理解测试 —— 词汇测试模块
 * 功能：
 *  1. 长篇英文段落
 *  2. 底部滑块选择理解程度
 *  3. 进度指示
 */

// ===== 测试段落 =====
const passages = [
  {
    text: `The concept of neuroplasticity has fundamentally altered our understanding of the human brain. Previously, scientists believed that the brain's structure was essentially fixed after childhood. However, decades of research have demonstrated that the brain continues to reorganize itself by forming new neural connections throughout life. This remarkable ability allows the brain to compensate for injury, adjust to new situations, and respond to changes in the environment. The implications of neuroplasticity extend far beyond neuroscience — they suggest that learning and personal growth are possible at any age.`,
    topic: '神经可塑性',
  },
  {
    text: `In recent years, the intersection of artificial intelligence and healthcare has yielded promising developments. Machine learning algorithms can now analyze medical images with accuracy comparable to — and sometimes exceeding — that of experienced radiologists. Natural language processing enables the extraction of meaningful insights from vast repositories of medical literature. Furthermore, predictive models are being developed to identify patients at risk of developing certain conditions before symptoms manifest, potentially revolutionizing preventive medicine.`,
    topic: 'AI 医疗',
  },
  {
    text: `The circular economy represents a systemic shift away from the traditional linear model of "take, make, dispose." Instead, it emphasizes designing out waste and pollution, keeping products and materials in use, and regenerating natural systems. Companies adopting circular principles are discovering that reducing waste can simultaneously lower costs and create new revenue streams. This approach is gaining traction not only among environmentalists but also among business leaders who recognize its economic potential.`,
    topic: '循环经济',
  },
]

// ===== 理解程度选项 =====
const comprehensionLevels = [
  { value: 1, label: '完全看不懂', emoji: '😰', color: '#EF4444' },
  { value: 2, label: '大部分不懂', emoji: '😟', color: '#FF8400' },
  { value: 3, label: '大概理解', emoji: '🤔', color: '#FFB366' },
  { value: 4, label: '基本理解', emoji: '😊', color: '#22C55E' },
  { value: 5, label: '完全理解', emoji: '🤩', color: '#3B82F6' },
]

export default function ReadingTestPage() {
  const navigate = useNavigate()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [results, setResults] = useState<number[]>([])

  const isFinished = currentIndex >= passages.length

  const handleNext = () => {
    if (selectedLevel !== null) {
      setResults(prev => [...prev, selectedLevel])
      setSelectedLevel(null)
      setCurrentIndex(prev => prev + 1)
    }
  }

  // 计算平均得分
  const avgScore = results.length > 0
    ? (results.reduce((s, v) => s + v, 0) / results.length).toFixed(1)
    : '0'

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">阅读理解测试</h1>
        <span className="text-[13px] text-[var(--color-muted)]">
          {Math.min(currentIndex + 1, passages.length)}/{passages.length}
        </span>
      </div>

      {/* ===== 进度条 ===== */}
      <div className="mx-5 mb-4 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${(currentIndex / passages.length) * 100}%` }} />
      </div>

      {isFinished ? (
        /* ===== 测试完成 ===== */
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <span className="text-[48px] mb-4">📊</span>
          <h2 className="text-[22px] font-bold text-[var(--color-foreground)] mb-2">测试完成！</h2>
          <p className="text-[14px] text-[var(--color-muted)] mb-6">
            你完成了 {passages.length} 篇阅读理解
          </p>
          <div className="w-full max-w-[200px] mb-8">
            <p className="text-[14px] text-[var(--color-muted)] mb-1">平均理解度</p>
            <p className="text-[48px] font-bold text-[var(--color-primary)]">{avgScore}</p>
            <p className="text-[12px] text-[var(--color-muted)]">/ 5.0</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold"
          >
            返回
          </button>
        </div>
      ) : (
        <>
          {/* ===== 文章区域 ===== */}
          <div className="flex-1 px-5 overflow-y-auto">
            <div className="mb-3">
              <span className="text-[11px] px-2 py-0.5 bg-[var(--color-primary-light)] rounded text-[var(--color-primary)] font-semibold">
                {passages[currentIndex].topic}
              </span>
            </div>
            <p className="text-[15px] text-[var(--color-foreground)] leading-[1.9] font-primary">
              {passages[currentIndex].text}
            </p>
          </div>

          {/* ===== 理解程度选择 ===== */}
          <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-card)]">
            <p className="text-[13px] font-semibold text-[var(--color-foreground)] mb-3 text-center">你对这篇文章的理解程度？</p>
            <div className="flex justify-between mb-4">
              {comprehensionLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setSelectedLevel(level.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-[var(--radius-xs)] transition-all ${
                    selectedLevel === level.value
                      ? 'scale-110'
                      : 'opacity-60'
                  }`}
                  style={{
                    backgroundColor: selectedLevel === level.value ? `${level.color}15` : 'transparent',
                    border: selectedLevel === level.value ? `2px solid ${level.color}` : '2px solid transparent',
                  }}
                >
                  <span className="text-[24px]">{level.emoji}</span>
                  <span className="text-[9px] text-[var(--color-muted)]">{level.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={handleNext}
              disabled={selectedLevel === null}
              className="w-full py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              下一篇 <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
