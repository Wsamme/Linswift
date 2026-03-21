import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Copy, Sparkles } from 'lucide-react'
import { longSentenceWritingPrompts } from '../data/longSentences'
import { useLogicalBack } from '../hooks/useLogicalBack'

export default function LongSentenceWritingPage() {
  const goBack = useLogicalBack('/grammar/long-sentence')
  const categories = useMemo(() => ['全部', ...Array.from(new Set(longSentenceWritingPrompts.map((item) => item.category)))], [])
  const [category, setCategory] = useState('全部')
  const filteredItems = useMemo(
    () => category === '全部' ? longSentenceWritingPrompts : longSentenceWritingPrompts.filter((item) => item.category === category),
    [category]
  )
  const [selectedId, setSelectedId] = useState(filteredItems[0]?.id ?? '')
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? '')
    }
  }, [filteredItems, selectedId])

  const current = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0]

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F6FFF8_0%,#F8FAFC_34%,#F8FAFC_100%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)]">长难句写作</h1>
        <div className="text-[12px] font-semibold text-[#16A34A]">{filteredItems.length} 题</div>
      </div>

      <div className="px-5 pb-8">
        <div className="mb-5 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-2 text-[12px] font-semibold ${category === item ? 'bg-[#14532D] text-white' : 'bg-white text-slate-600 shadow-sm'}`}
            >
              {item}
            </button>
          ))}
        </div>

        {current && (
          <div className="grid gap-5 xl:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#16A34A]">{current.category}</div>
                  <div className="mt-2 text-[22px] font-bold text-slate-900">{current.title}</div>
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(current.prompt)}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-[12px] font-semibold text-slate-600"
                >
                  <Copy size={14} />
                  复制题目
                </button>
              </div>

              <div className="mt-4 rounded-[22px] bg-[linear-gradient(135deg,#F0FDF4,#ECFCCB)] p-4">
                <div className="text-[15px] font-semibold text-slate-900">题目要求</div>
                <div className="mt-2 text-[15px] leading-8 text-slate-700">{current.prompt}</div>
              </div>

              <div className="mt-4">
                <div className="text-[14px] font-semibold text-slate-900">必须尝试的结构</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {current.targetPatterns.map((pattern) => (
                    <span key={pattern} className="rounded-full bg-[#E8F7EC] px-3 py-1.5 text-[12px] font-semibold text-[#15803D]">
                      {pattern}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[14px] font-semibold text-slate-900">连接词提示</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {current.connectorHints.map((hint) => (
                    <span key={hint} className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-[12px] font-semibold text-[#2563EB]">
                      {hint}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {current.guidance.map((tip, index) => (
                  <div key={`${tip}-${index}`} className="rounded-[14px] bg-slate-50 px-3 py-2 text-[13px] leading-6 text-slate-700">
                    {tip}
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[14px] font-semibold text-slate-900">先自己写一句</div>
                <textarea
                  value={drafts[current.id] || ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [current.id]: e.target.value }))}
                  placeholder="先按提示自己写，再对照参考答案看结构。"
                  className="min-h-[160px] w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] leading-7 text-slate-800 outline-none transition focus:border-[#16A34A] focus:bg-white"
                />
              </div>

              <div className="mt-5 rounded-[22px] border border-[#DCFCE7] bg-[#F0FDF4] p-4">
                <div className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#166534]">
                  <Sparkles size={16} />
                  参考长句
                </div>
                <div className="mt-2 text-[15px] leading-8 text-slate-800">{current.sampleAnswer}</div>
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
              <div className="text-[18px] font-bold text-slate-900">50 个静态场景</div>
              <div className="mt-1 text-[13px] text-slate-500">每题都要求你使用带连接词的长句，而不是短句堆砌。</div>
              <div className="mt-4 space-y-3">
                {filteredItems.map((item, index) => {
                  const active = item.id === current?.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-[20px] border p-4 text-left ${active ? 'border-[#16A34A] bg-[#F0FDF4]' : 'border-slate-100 bg-slate-50'}`}
                    >
                      <div className="text-[11px] font-semibold text-[#16A34A]">#{String(index + 1).padStart(2, '0')} · {item.category}</div>
                      <div className="mt-1 text-[15px] font-bold text-slate-900">{item.title}</div>
                      <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-slate-600">{item.prompt}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
