import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bookmark, ChevronLeft } from 'lucide-react'
import LongSentenceAnalysisPanel from '../components/grammar/LongSentenceAnalysisPanel'
import { longSentenceReadingItems } from '../data/longSentences'
import { findGrammarBlueprintsByReadingId } from '../data/grammarCatalog'
import { useLongSentenceCollection } from '../hooks/useLongSentenceCollection'
import { useLogicalBack } from '../hooks/useLogicalBack'

export default function LongSentenceReadingPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/grammar/long-sentence')
  const { saveFromReading, isSentenceSaved } = useLongSentenceCollection()
  const [searchParams] = useSearchParams()
  const categories = useMemo(() => ['全部', ...Array.from(new Set(longSentenceReadingItems.map((item) => item.category)))], [])
  const [category, setCategory] = useState('全部')
  const filteredItems = useMemo(
    () => category === '全部' ? longSentenceReadingItems : longSentenceReadingItems.filter((item) => item.category === category),
    [category]
  )
  const initialId = searchParams.get('id') || ''
  const [selectedId, setSelectedId] = useState(initialId || filteredItems[0]?.id || '')

  useEffect(() => {
    if (!filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? '')
    }
  }, [filteredItems, selectedId])

  const current = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0]
  const saved = current ? isSentenceSaved('reading', current.sentence) : false
  const relatedGrammarLessons = useMemo(
    () => current ? findGrammarBlueprintsByReadingId(current.id) : [],
    [current],
  )

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FFF9F2_0%,#F8FAFC_35%,#F8FAFC_100%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)]">长难句阅读</h1>
        <div className="text-[12px] font-semibold text-[var(--color-primary)]">{filteredItems.length} 句</div>
      </div>

      <div className="px-5 pb-8">
        <div className="mb-5 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-2 text-[12px] font-semibold ${category === item ? 'bg-[#111827] text-white' : 'bg-white text-slate-600 shadow-sm'}`}
            >
              {item}
            </button>
          ))}
        </div>

        {current && (
          <>
            <LongSentenceAnalysisPanel
              title={current.title}
              subtitle={`${current.category} · ${current.difficulty}`}
              focus={current.focus}
              analysis={current.analysis}
              actions={(
                <button
                  onClick={() => saveFromReading(current)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold ${saved ? 'bg-[#EEFCEF] text-[#15803D]' : 'bg-[#111827] text-white'}`}
                >
                  <Bookmark size={14} />
                  {saved ? '已收藏' : '收藏句子'}
                </button>
              )}
            />

            {relatedGrammarLessons.length > 0 && (
              <div className="mt-4 rounded-[24px] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="text-[15px] font-bold text-slate-900">相关语法课</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedGrammarLessons.map((lesson) => (
                    <button
                      key={lesson.nodeId}
                      onClick={() => navigate(`/grammar/lesson?id=${encodeURIComponent(lesson.nodeId)}`)}
                      className="rounded-full bg-[#FFF3E7] px-3 py-2 text-[12px] font-semibold text-[#C86A00]"
                    >
                      {lesson.level} · {lesson.cluster}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-6 rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[18px] font-bold text-slate-900">50 句静态题库</div>
              <div className="text-[13px] text-slate-500">点一句，右侧就切到对应解析。</div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item, index) => {
              const active = item.id === current?.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`rounded-[22px] border p-4 text-left transition-all ${active ? 'border-[#FF8400] bg-[#FFF7EF] shadow-sm' : 'border-slate-100 bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-semibold text-[#FF8400]">#{String(index + 1).padStart(2, '0')}</div>
                    <div className="text-[11px] text-slate-400">{item.category}</div>
                  </div>
                  <div className="mt-2 text-[15px] font-bold text-slate-900">{item.title}</div>
                  <div className="mt-2 line-clamp-3 text-[13px] leading-6 text-slate-600">{item.sentence}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
