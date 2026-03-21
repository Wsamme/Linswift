import {
  LONG_SENTENCE_ROLE_META,
  isLongSentenceRole,
  type LongSentenceSegment,
} from '../../lib/longSentence'

interface LongSentenceAnnotatedTextProps {
  segments: LongSentenceSegment[]
  showLegend?: boolean
  className?: string
}

export default function LongSentenceAnnotatedText({
  segments,
  showLegend = true,
  className = '',
}: LongSentenceAnnotatedTextProps) {
  const safeSegments = segments.map((segment) => ({
    ...segment,
    role: isLongSentenceRole(segment.role) ? segment.role : 'modifier',
  }))
  const usedRoles = Array.from(new Set(safeSegments.map((segment) => segment.role)))

  return (
    <div className={className}>
      <div className="rounded-[20px] bg-white/80 p-4 leading-[2.15] text-[18px] text-slate-900 shadow-sm">
        {safeSegments.map((segment, index) => {
          const meta = LONG_SENTENCE_ROLE_META[segment.role]
          return (
            <span
              key={`${segment.role}-${index}-${segment.text}`}
              title={`${meta.label}：${segment.note}`}
              className="inline rounded-[10px] px-0.5 py-0.5"
              style={{
                backgroundColor: meta.soft,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
                textDecorationLine: 'underline',
                textDecorationStyle: 'solid',
                textDecorationColor: meta.color,
                textDecorationThickness: '3px',
                textUnderlineOffset: '7px',
              }}
            >
              {segment.text}
            </span>
          )
        })}
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-2">
          {usedRoles.map((role) => {
            const meta = LONG_SENTENCE_ROLE_META[role]
            return (
              <span
                key={role}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                style={{ backgroundColor: meta.soft, color: meta.color }}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
