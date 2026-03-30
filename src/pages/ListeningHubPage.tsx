import { ChevronLeft, Headphones, Wrench } from 'lucide-react'
import { useLogicalBack } from '../hooks/useLogicalBack'

export default function ListeningHubPage() {
  const goBack = useLogicalBack('/app/learn')

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听力训练</h1>
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
            听力训练正在开发中
          </h2>
          <p className="mx-auto mt-3 max-w-[320px] text-[13px] leading-6 text-[var(--color-muted)]">
            听歌填字、随行听和听力图书馆会在后续版本统一开放。当前阶段先保留入口提示，避免误导到未完成流程。
          </p>
          <div className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-background-secondary)]">
            <Headphones size={20} className="text-[var(--color-muted)]" />
          </div>
        </section>
      </div>
    </div>
  )
}
