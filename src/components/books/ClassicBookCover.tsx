import type { ClassicBookCatalogItem } from '../../data/classicBooks'

interface ClassicBookCoverProps {
  book: ClassicBookCatalogItem
  compact?: boolean
}

function getPatternTransform(pattern: ClassicBookCatalogItem['coverTheme']['pattern']) {
  const pivotX = 150
  const pivotY = 176

  const pivotScale = (scale: number, tx = 0, ty = 0) =>
    `translate(${tx} ${ty}) translate(${pivotX} ${pivotY}) scale(${scale}) translate(${-pivotX} ${-pivotY})`

  switch (pattern) {
    case 'detective':
      return pivotScale(0.94, 0, 8)
    case 'river':
      return pivotScale(0.96, 0, 14)
    case 'wave':
      return pivotScale(0.95, 0, 12)
    case 'city':
      return pivotScale(0.94, 0, 10)
    case 'mirror':
      return pivotScale(0.94, 0, 6)
    case 'leaf':
      return pivotScale(1.22, -4, 10)
    default:
      return pivotScale(1)
  }
}

function BookPattern({ pattern, accent }: { pattern: ClassicBookCatalogItem['coverTheme']['pattern']; accent: string }) {
  switch (pattern) {
    case 'rabbit':
      return (
        <>
          <ellipse cx="150" cy="182" rx="32" ry="40" fill={accent} opacity="0.12" />
          <ellipse cx="136" cy="142" rx="10" ry="26" fill={accent} opacity="0.9" />
          <ellipse cx="164" cy="138" rx="10" ry="29" fill={accent} opacity="0.86" />
          <circle cx="151" cy="177" r="24" fill={accent} opacity="0.88" />
          <circle cx="178" cy="199" r="13" fill={accent} opacity="0.82" />
        </>
      )
    case 'rose':
      return (
        <>
          <circle cx="150" cy="175" r="42" fill={accent} opacity="0.14" />
          <path d="M150 128c12 0 24 12 24 24s-12 24-24 24-24-12-24-24 12-24 24-24Z" fill={accent} opacity="0.92" />
          <path d="M150 176c-25 0-42 22-42 48 18-16 34-22 42-22s24 6 42 22c0-26-17-48-42-48Z" fill={accent} opacity="0.82" />
          <path d="M150 198v50" stroke={accent} strokeWidth="8" strokeLinecap="round" opacity="0.8" />
        </>
      )
    case 'detective':
      return (
        <>
          <circle cx="145" cy="168" r="34" fill="none" stroke={accent} strokeWidth="12" opacity="0.9" />
          <path d="M170 193l34 34" stroke={accent} strokeWidth="12" strokeLinecap="round" opacity="0.84" />
          <path d="M112 134c14-18 38-29 64-29" stroke={accent} strokeWidth="6" strokeLinecap="round" opacity="0.42" />
        </>
      )
    case 'river':
      return (
        <>
          <path d="M64 198c28-34 54-44 80-44s52 10 92 44" fill="none" stroke={accent} strokeWidth="18" strokeLinecap="round" opacity="0.82" />
          <path d="M94 150c8-24 26-34 56-34 28 0 50 12 64 34" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" opacity="0.42" />
        </>
      )
    case 'lightning':
      return (
        <>
          <path d="M170 96l-48 70h34l-20 60 62-84h-34l18-46Z" fill={accent} opacity="0.9" />
          <circle cx="152" cy="168" r="64" fill={accent} opacity="0.09" />
        </>
      )
    case 'moon':
      return (
        <>
          <circle cx="154" cy="148" r="46" fill={accent} opacity="0.88" />
          <circle cx="174" cy="138" r="42" fill="white" opacity="0.92" />
          <path d="M92 220c30-28 64-38 114-38" stroke={accent} strokeWidth="8" strokeLinecap="round" opacity="0.4" />
        </>
      )
    case 'leaf':
      return (
        <>
          <path d="M152 112c34 20 54 56 44 94-37-4-70-32-80-74 4-8 14-18 36-20Z" fill={accent} opacity="0.9" />
          <path d="M144 132c-18 32-24 58-16 88" stroke={accent} strokeWidth="7" strokeLinecap="round" opacity="0.45" />
        </>
      )
    case 'wave':
      return (
        <>
          <path d="M84 206c24-42 56-64 100-64 22 0 44 6 70 20-26 8-40 22-50 46-20-6-36-8-48-8-28 0-50 2-72 6Z" fill={accent} opacity="0.88" />
          <path d="M90 150c28-20 58-28 92-24" stroke={accent} strokeWidth="8" strokeLinecap="round" opacity="0.42" />
        </>
      )
    case 'city':
      return (
        <>
          <rect x="88" y="138" width="28" height="84" rx="6" fill={accent} opacity="0.82" />
          <rect x="122" y="120" width="34" height="102" rx="6" fill={accent} opacity="0.92" />
          <rect x="162" y="150" width="22" height="72" rx="6" fill={accent} opacity="0.76" />
          <rect x="190" y="128" width="24" height="94" rx="6" fill={accent} opacity="0.66" />
        </>
      )
    case 'mirror':
      return (
        <>
          <rect x="112" y="96" width="76" height="114" rx="38" fill="none" stroke={accent} strokeWidth="12" opacity="0.92" />
          <path d="M150 210v22" stroke={accent} strokeWidth="12" strokeLinecap="round" opacity="0.85" />
          <path d="M126 230h48" stroke={accent} strokeWidth="12" strokeLinecap="round" opacity="0.7" />
        </>
      )
  }
}

export default function ClassicBookCover({ book, compact = false }: ClassicBookCoverProps) {
  const [from, to] = book.coverTheme.background
  const titleLines = compact
    ? [book.title]
    : book.title.split(':')[0].split(' ').reduce<string[]>((lines, word) => {
        const current = lines[lines.length - 1]
        if (!current || current.length > 14) {
          lines.push(word)
        } else {
          lines[lines.length - 1] = `${current} ${word}`
        }
        return lines
      }, []).slice(0, 3)
  const shellRadius = compact ? '16px' : '20px'
  const panelRadius = compact ? '14px' : '18px'
  const panelPadding = compact ? '0.55rem' : '0.75rem'
  const tagClass = compact
    ? 'inline-flex rounded-full border border-white/28 bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.18em] text-white/85 uppercase backdrop-blur-sm'
    : 'inline-flex rounded-full border border-white/35 bg-white/12 px-2 py-1 text-[10px] font-semibold tracking-[0.22em] text-white/90 uppercase backdrop-blur-sm'
  const authorClass = compact
    ? 'mb-1 text-[7px] font-semibold uppercase tracking-[0.22em] text-white/75'
    : 'mb-1 text-[9px] font-semibold uppercase tracking-[0.28em] text-white/80'
  const titleClass = compact ? 'text-[11px]' : 'text-[18px]'

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ borderRadius: shellRadius, background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)` }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[38%] opacity-90"
        style={{
          background: `radial-gradient(circle at top, ${book.coverTheme.glow} 0%, rgba(255,255,255,0) 72%)`,
        }}
      />

      <div className="absolute inset-0">
        <svg viewBox="0 0 300 460" className="h-full w-full">
          <defs>
            <linearGradient id={`cover-gradient-${book.slug}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <rect x="14" y="14" width="272" height="432" rx="28" fill={`url(#cover-gradient-${book.slug})`} opacity="0.78" />
          <circle cx="246" cy="84" r="56" fill="white" opacity="0.08" />
          <circle cx="72" cy="370" r="72" fill="white" opacity="0.08" />
          <g transform={getPatternTransform(book.coverTheme.pattern)}>
            <BookPattern pattern={book.coverTheme.pattern} accent={book.coverTheme.accent} />
          </g>
        </svg>
      </div>

      <div className={`relative z-10 flex h-full flex-col justify-between ${compact ? 'p-2.5' : 'p-4'}`}>
        <div>
          <div className={tagClass}>
            AI Cover
          </div>
        </div>

        <div className="bg-black/12 text-white backdrop-blur-[6px]" style={{ borderRadius: panelRadius, padding: panelPadding }}>
          <div className={authorClass}>
            {book.author}
          </div>
          <div className={`${titleClass} font-bold leading-[1.06]`}>
            {titleLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          {!compact && (
            <div className="mt-2 text-[10px] font-medium tracking-[0.14em] text-white/78 uppercase">
              {book.coverTheme.tagline}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
