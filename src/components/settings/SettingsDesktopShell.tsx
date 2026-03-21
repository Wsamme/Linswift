import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

interface SettingsDesktopShellProps {
  title: string
  description: string
  backLabel?: string
  onBack: () => void
  sideTitle: string
  sideDescription: string
  sideContent?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export default function SettingsDesktopShell({
  title,
  description,
  backLabel = '返回',
  onBack,
  sideTitle,
  sideDescription,
  sideContent,
  actions,
  children,
}: SettingsDesktopShellProps) {
  return (
    <div className="glass-page h-full overflow-y-auto">
      <div className="mx-auto max-w-[1360px] px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <button
              onClick={onBack}
              className="glass-card-elevated inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--color-foreground)]"
              aria-label={backLabel}
            >
              <ChevronLeft size={22} />
            </button>
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Personal Settings</p>
              <h1 className="mt-2 text-[30px] font-bold text-[var(--color-foreground)] font-secondary">{title}</h1>
              <p className="mt-2 max-w-[760px] text-[14px] leading-6 text-[var(--color-muted)]">{description}</p>
            </div>
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>

        <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
          <aside className="space-y-6">
            <div className="glass-card-strong rounded-[30px] p-6">
              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">{sideTitle}</p>
              <p className="mt-3 text-[14px] leading-6 text-[var(--color-foreground)]/82">{sideDescription}</p>
            </div>
            {sideContent}
          </aside>

          <div className="space-y-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
