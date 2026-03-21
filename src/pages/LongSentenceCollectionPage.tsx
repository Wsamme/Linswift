import { useEffect, useState } from 'react'
import { BookmarkX, ChevronLeft } from 'lucide-react'
import LongSentenceAnalysisPanel from '../components/grammar/LongSentenceAnalysisPanel'
import { useLongSentenceCollection } from '../hooks/useLongSentenceCollection'
import { useLogicalBack } from '../hooks/useLogicalBack'

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export default function LongSentenceCollectionPage() {
  const goBack = useLogicalBack('/grammar/long-sentence')
  const { items, removeItem } = useLongSentenceCollection()
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '')

  useEffect(() => {
    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? '')
    }
  }, [items, selectedId])

  const current = items.find((item) => item.id === selectedId) ?? items[0]

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FFF5F8_0%,#F8FAFC_34%,#F8FAFC_100%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)]">长难句收藏</h1>
        <div className="text-[12px] font-semibold text-[#BE185D]">{items.length} 条</div>
      </div>

      <div className="px-5 pb-8">
        {items.length === 0 ? (
          <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <div className="text-[18px] font-bold text-slate-900">还没有收藏的长难句</div>
            <div className="mt-2 text-[14px] leading-7 text-slate-600">你可以从静态阅读或 AI 自动分析页面把值得复盘的句子收进来。</div>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[0.84fr,1.16fr]">
            <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
              <div className="text-[18px] font-bold text-slate-900">我的句子夹</div>
              <div className="mt-1 text-[13px] text-slate-500">静态句和 AI 句统一放在这里，便于二刷。</div>
              <div className="mt-4 space-y-3">
                {items.map((item) => {
                  const active = item.id === current?.id
                  return (
                    <div
                      key={item.id}
                      className={`rounded-[20px] border p-4 ${active ? 'border-[#BE185D] bg-[#FFF1F6]' : 'border-slate-100 bg-slate-50'}`}
                    >
                      <button onClick={() => setSelectedId(item.id)} className="w-full text-left">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-semibold text-[#BE185D]">{item.source === 'ai' ? 'AI 拆句' : item.category}</div>
                          <div className="text-[11px] text-slate-400">{formatDate(item.savedAt)}</div>
                        </div>
                        <div className="mt-1 text-[15px] font-bold text-slate-900">{item.title}</div>
                        <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-slate-600">{item.sentence}</div>
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#B42318]"
                      >
                        <BookmarkX size={14} />
                        取消收藏
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {current && (
              <LongSentenceAnalysisPanel
                title={current.title}
                subtitle={`${current.category} · ${current.source === 'ai' ? 'AI 分析结果' : '静态阅读句'}`}
                analysis={current.analysis}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
