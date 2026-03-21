import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { LegalDocument } from '../../data/legalDocuments'

interface LegalDocumentPageProps {
  document: LegalDocument
}

export default function LegalDocumentPage({ document }: LegalDocumentPageProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-[var(--color-background-secondary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[860px] flex-col px-5 pb-8 pt-4 md:px-8 md:pb-12 md:pt-6">
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-card)] transition-transform active:scale-95"
            aria-label="返回"
          >
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-light)]">
              Legal
            </p>
            <h1 className="text-[20px] font-bold text-[var(--color-foreground)] md:text-[26px]">
              {document.shortTitle}
            </h1>
          </div>
        </div>

        <div
          className="rounded-[28px] bg-[var(--color-card)] px-5 py-6 md:px-8 md:py-8"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="border-b border-[var(--color-border)] pb-5 md:pb-6">
            <h2 className="text-[24px] font-bold text-[var(--color-foreground)] md:text-[32px]">
              {document.title}
            </h2>
            <p className="mt-3 text-[14px] leading-7 text-[var(--color-muted)] md:text-[15px]">
              {document.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-[var(--color-muted-light)] md:text-[13px]">
              <span>生效日期：{document.effectiveDate}</span>
              <span>最近更新：{document.lastUpdated}</span>
            </div>
          </div>

          <div className="space-y-6 pt-6 md:space-y-7 md:pt-7">
            {document.sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-[16px] font-semibold text-[var(--color-foreground)] md:text-[18px]">
                  {section.title}
                </h3>

                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-3 text-[14px] leading-7 text-[var(--color-muted)] md:text-[15px]"
                  >
                    {paragraph}
                  </p>
                ))}

                {section.bullets && section.bullets.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {section.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex gap-3 text-[14px] leading-7 text-[var(--color-muted)] md:text-[15px]"
                      >
                        <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
