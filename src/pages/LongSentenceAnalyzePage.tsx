import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, ChevronLeft, Loader2, Sparkles } from 'lucide-react'
import LongSentenceAnalysisPanel from '../components/grammar/LongSentenceAnalysisPanel'
import { longSentenceReadingItems } from '../data/longSentences'
import { findGrammarBlueprintsByHints } from '../data/grammarCatalog'
import { useLongSentenceCollection } from '../hooks/useLongSentenceCollection'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { analyzeLongSentence } from '../services/gemini'
import type { LongSentenceAnalysis } from '../lib/longSentence'

export default function LongSentenceAnalyzePage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/grammar/long-sentence')
  const { saveAiAnalysis, isSentenceSaved } = useLongSentenceCollection()
  const [sentence, setSentence] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LongSentenceAnalysis | null>(null)

  const saved = result ? isSentenceSaved('ai', result.sentence) : false
  const relatedLessons = result ? findGrammarBlueprintsByHints([
    result.summary,
    result.translation,
    ...result.grammarPoints,
    ...result.connectors.map((item) => item.text),
  ]) : []

  async function handleAnalyze() {
    const trimmed = sentence.trim()
    if (!trimmed) {
      setError('先粘贴一句完整的英文长句。')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const analysis = await analyzeLongSentence(trimmed)
      setResult(analysis)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 分析失败，请稍后再试。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F4F8FF_0%,#F8FAFC_35%,#F8FAFC_100%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)]">AI 自动分析</h1>
        <div className="w-6" />
      </div>

      <div className="px-5 pb-8">
        <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="text-[22px] font-bold text-slate-900">贴一句英文长句，马上拆骨架</div>
          <div className="mt-2 text-[14px] leading-7 text-slate-600">
            AI 会优先输出主谓宾、连接词、从句功能；如果接口暂时不可用，页面也会给你本地拆句结果，不会空白。
          </div>

          <textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder="例如：Although the report was completed on time, the manager delayed the meeting because several charts needed to be updated."
            className="mt-4 min-h-[180px] w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-[14px] leading-7 text-slate-800 outline-none transition focus:border-[#2563EB] focus:bg-white"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {longSentenceReadingItems.slice(0, 5).map((item) => (
              <button
                key={item.id}
                onClick={() => setSentence(item.sentence)}
                className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-[12px] font-semibold text-[#2563EB]"
              >
                示例：{item.title}
              </button>
            ))}
          </div>

          {error && <div className="mt-4 rounded-[16px] bg-[#FEF2F2] px-4 py-3 text-[13px] text-[#B91C1C]">{error}</div>}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-5 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? '分析中...' : '开始分析'}
            </button>

            {result && (
              <button
                onClick={() => saveAiAnalysis({
                  title: `AI 拆句 · ${result.sentence.slice(0, 18)}${result.sentence.length > 18 ? '...' : ''}`,
                  sentence: result.sentence,
                  analysis: result,
                })}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold ${saved ? 'bg-[#E8F7EC] text-[#15803D]' : 'bg-slate-900 text-white'}`}
              >
                <Bookmark size={16} />
                {saved ? '已收藏' : '收藏到长难句夹'}
              </button>
            )}
          </div>
        </div>

        {result && (
          <div className="mt-6">
            <LongSentenceAnalysisPanel
              title="AI 分析结果"
              subtitle="主谓宾、连接词、意群拆分都在同一套渲染里展示。"
              analysis={result}
            />

            {relatedLessons.length > 0 && (
              <div className="mt-4 rounded-[24px] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="text-[15px] font-bold text-slate-900">推荐回看语法课</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {relatedLessons.map((lesson) => (
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
          </div>
        )}
      </div>
    </div>
  )
}
