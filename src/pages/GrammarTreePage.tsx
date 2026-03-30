import { BookOpenText, ChevronLeft, Sparkles, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'

export default function GrammarTreePage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">语法知识树</h1>
      </div>

      <div className="px-5 pb-10">
        <section
          className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-8 text-center"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <Wrench size={24} />
          </div>
          <span className="inline-flex items-center rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--color-primary)]">
            UNDER DEVELOPMENT
          </span>
          <h2 className="mt-4 text-[22px] font-bold text-[var(--color-foreground)] font-secondary">
            语法知识树正在开发中
          </h2>
          <p className="mx-auto mt-3 max-w-[360px] text-[13px] leading-6 text-[var(--color-muted)]">
            语法树、课程路径和系统化练习还在整理中。当前先保留已经可用的长难句学习入口，避免把未完成模块直接暴露出来。
          </p>
        </section>

        <section
          className="mt-5 rounded-[24px] bg-[linear-gradient(135deg,#111827,#334155)] p-5 text-white shadow-[0_18px_36px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/70">
            <Sparkles size={14} />
            Long Sentence
          </div>
          <div className="mt-2 text-[24px] font-bold leading-tight">长难句功能保留可用</div>
          <div className="mt-2 text-[13px] leading-7 text-white/75">
            你仍然可以继续使用长难句阅读、拆解、分析和收藏功能。后续语法知识树会围绕这条能力线逐步补齐。
          </div>
          <button
            onClick={() => navigateSafely(navigate, '/grammar/long-sentence')}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-900 active:scale-[0.98]"
          >
            <BookOpenText size={15} />
            进入长难句学习
          </button>
        </section>
      </div>
    </div>
  )
}
