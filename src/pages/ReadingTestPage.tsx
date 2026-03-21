import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLogicalBack } from '../hooks/useLogicalBack'

const comprehensionLevels = [
  { value: 1, label: '完全看不懂', emoji: '😰', color: '#EF4444' },
  { value: 2, label: '大部分不懂', emoji: '😟', color: '#FF8400' },
  { value: 3, label: '大概理解', emoji: '🤔', color: '#FFB366' },
  { value: 4, label: '基本理解', emoji: '😊', color: '#22C55E' },
  { value: 5, label: '完全理解', emoji: '🤩', color: '#3B82F6' },
]

interface ReadingTestItem {
  id: number
  title: string
  passage: string
}

export default function ReadingTestPage() {
  const goBack = useLogicalBack('/app/learn')
  const [items, setItems] = useState<ReadingTestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null)
  const [results, setResults] = useState<number[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('reading_tests').select('id,title,passage').order('created_at', { ascending: false }).limit(10)
      setItems((data || []) as any)
      setLoading(false)
    }
    load()
  }, [])

  const isFinished = currentIndex >= items.length

  const handleNext = () => {
    if (selectedLevel !== null) {
      setResults((prev) => [...prev, selectedLevel])
      setSelectedLevel(null)
      setCurrentIndex((prev) => prev + 1)
    }
  }

  const avgScore = results.length > 0 ? (results.reduce((s, v) => s + v, 0) / results.length).toFixed(1) : '0'

  if (loading) {
    return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[var(--color-primary)]" /></div>
  }
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-6">
        <p className="text-[14px] text-[var(--color-muted)]">暂无阅读测试数据，请先向 `reading_tests` 写入数据。</p>
        <button onClick={goBack} className="mt-4 px-4 py-2 rounded bg-[var(--color-primary)] text-white text-[13px]">返回</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">阅读理解测试</h1>
        <span className="text-[13px] text-[var(--color-muted)]">{Math.min(currentIndex + 1, items.length)}/{items.length}</span>
      </div>

      <div className="mx-5 mb-4 h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
        <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${(currentIndex / items.length) * 100}%` }} />
      </div>

      {isFinished ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <span className="text-[48px] mb-4">📊</span>
          <h2 className="text-[22px] font-bold text-[var(--color-foreground)] mb-2">测试完成！</h2>
          <p className="text-[14px] text-[var(--color-muted)] mb-6">你完成了 {items.length} 篇阅读理解</p>
          <div className="w-full max-w-[200px] mb-8">
            <p className="text-[14px] text-[var(--color-muted)] mb-1">平均理解度</p>
            <p className="text-[48px] font-bold text-[var(--color-primary)]">{avgScore}</p>
            <p className="text-[12px] text-[var(--color-muted)]">/ 5.0</p>
          </div>
          <button onClick={goBack} className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold">返回</button>
        </div>
      ) : (
        <>
          <div className="flex-1 px-5 overflow-y-auto">
            <div className="mb-3">
              <span className="text-[11px] px-2 py-0.5 bg-[var(--color-primary-light)] rounded text-[var(--color-primary)] font-semibold">
                {items[currentIndex].title}
              </span>
            </div>
            <p className="text-[15px] text-[var(--color-foreground)] leading-[1.9] font-primary">{items[currentIndex].passage}</p>
          </div>

          <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-card)]">
            <p className="text-[13px] font-semibold text-[var(--color-foreground)] mb-3 text-center">你对这篇文章的理解程度？</p>
            <div className="flex justify-between mb-4">
              {comprehensionLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setSelectedLevel(level.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-[var(--radius-xs)] transition-all ${selectedLevel === level.value ? 'scale-110' : 'opacity-60'}`}
                  style={{ backgroundColor: selectedLevel === level.value ? `${level.color}15` : 'transparent', border: selectedLevel === level.value ? `2px solid ${level.color}` : '2px solid transparent' }}
                >
                  <span className="text-[24px]">{level.emoji}</span>
                  <span className="text-[9px] text-[var(--color-muted)]">{level.label}</span>
                </button>
              ))}
            </div>
            <button onClick={handleNext} disabled={selectedLevel === null} className="w-full py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
              下一篇 <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
