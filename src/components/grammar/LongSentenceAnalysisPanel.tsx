import type { ReactNode } from 'react'
import LongSentenceAnnotatedText from './LongSentenceAnnotatedText'
import type { LongSentenceAnalysis } from '../../lib/longSentence'

interface LongSentenceAnalysisPanelProps {
  title: string
  subtitle?: string
  focus?: string
  analysis: LongSentenceAnalysis
  actions?: ReactNode
}

export default function LongSentenceAnalysisPanel({
  title,
  subtitle,
  focus,
  analysis,
  actions,
}: LongSentenceAnalysisPanelProps) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))] p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)]"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>

        {focus && (
          <div className="mb-4 inline-flex rounded-full bg-[#FFF3E7] px-3 py-1.5 text-[12px] font-semibold text-[#C86A00]">
            句型焦点：{focus}
          </div>
        )}

        <LongSentenceAnnotatedText segments={analysis.segments} />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[20px] bg-slate-50 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">结构总结</div>
            <p className="mt-2 text-[14px] leading-7 text-slate-700">{analysis.summary}</p>
            <p className="mt-3 text-[14px] leading-7 text-slate-900">{analysis.translation}</p>
          </div>

          <div className="rounded-[20px] bg-slate-50 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">拆成短句</div>
            <div className="mt-2 space-y-2">
              {analysis.simpleRewrites.map((item, index) => (
                <div key={`${item}-${index}`} className="rounded-[14px] bg-white px-3 py-2 text-[13px] leading-6 text-slate-700">
                  {index + 1}. {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-[24px] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <div className="mb-3 text-[15px] font-bold text-slate-900">分块解析</div>
          <div className="space-y-3">
            {analysis.clauses.map((clause, index) => (
              <div key={`${clause.label}-${index}`} className="rounded-[18px] border border-slate-100 bg-slate-50 p-4">
                <div className="text-[12px] font-semibold text-[#FF8400]">{clause.label}</div>
                <div className="mt-1 text-[14px] font-semibold leading-7 text-slate-900">{clause.text}</div>
                <div className="mt-2 text-[13px] leading-6 text-slate-600">{clause.function}</div>
                <div className="mt-2 rounded-[12px] bg-white px-3 py-2 text-[12px] leading-6 text-slate-500">
                  短句版：{clause.simplified}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="mb-3 text-[15px] font-bold text-slate-900">连接词与功能</div>
            <div className="flex flex-wrap gap-2">
              {analysis.connectors.length > 0 ? analysis.connectors.map((item, index) => (
                <span key={`${item.text}-${index}`} className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-[12px] font-semibold text-[#2855C5]">
                  {item.text} · {item.function}
                </span>
              )) : (
                <span className="text-[13px] text-slate-500">这句主要依靠语序和从句嵌套，不靠明显连接词。</span>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="mb-3 text-[15px] font-bold text-slate-900">语法提醒</div>
            <div className="space-y-2">
              {analysis.grammarPoints.map((point, index) => (
                <div key={`${point}-${index}`} className="rounded-[14px] bg-slate-50 px-3 py-2 text-[13px] leading-6 text-slate-700">
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
