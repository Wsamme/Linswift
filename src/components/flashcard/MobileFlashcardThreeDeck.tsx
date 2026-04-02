import { useRef, useState, useCallback, useEffect } from 'react'
import { Lightbulb, Loader2 } from 'lucide-react'

interface FlashcardContent {
  word: string
  phonetic: string
  meaning: string
  example: string
  mnemonic?: string
}

interface MobileFlashcardThreeDeckProps {
  card: FlashcardContent
  flipped: boolean
  mnemonic?: string
  mnemonicLoading?: boolean
  onFlip: () => void
  onSwipeKnow: () => void
  onSwipeUnknown: () => void
}

const SWIPE_THRESHOLD = 80
const SWIPE_VELOCITY_THRESHOLD = 0.4

export default function MobileFlashcardThreeDeck({
  card,
  flipped,
  mnemonic,
  mnemonicLoading,
  onFlip,
  onSwipeKnow,
  onSwipeUnknown,
}: MobileFlashcardThreeDeckProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    offsetX: 0,
    offsetY: 0,
  })
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null)

  const swipeIntent =
    dragState.offsetX > 30 ? 'know' : dragState.offsetX < -30 ? 'unknown' : null
  const swipeProgress = Math.min(Math.abs(dragState.offsetX) / SWIPE_THRESHOLD, 1)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragState({
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      offsetX: 0,
      offsetY: 0,
    })
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.isDragging) return
      setDragState((prev) => ({
        ...prev,
        offsetX: e.clientX - prev.startX,
        offsetY: e.clientY - prev.startY,
      }))
    },
    [dragState.isDragging],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.isDragging) return

      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY
      const dist = Math.hypot(dx, dy)
      const elapsed = Date.now() - dragState.startTime
      const velocity = Math.abs(dx) / elapsed

      // Tap — flip
      if (dist < 10 && elapsed < 300) {
        setDragState((prev) => ({ ...prev, isDragging: false, offsetX: 0, offsetY: 0 }))
        onFlip()
        return
      }

      // Swipe right — know
      if (dx > SWIPE_THRESHOLD || (dx > 40 && velocity > SWIPE_VELOCITY_THRESHOLD)) {
        setExitDir('right')
        setTimeout(() => {
          onSwipeKnow()
          setExitDir(null)
        }, 280)
        setDragState((prev) => ({ ...prev, isDragging: false, offsetX: 0, offsetY: 0 }))
        return
      }

      // Swipe left — unknown
      if (dx < -SWIPE_THRESHOLD || (dx < -40 && velocity > SWIPE_VELOCITY_THRESHOLD)) {
        setExitDir('left')
        setTimeout(() => {
          onSwipeUnknown()
          setExitDir(null)
        }, 280)
        setDragState((prev) => ({ ...prev, isDragging: false, offsetX: 0, offsetY: 0 }))
        return
      }

      // Snap back
      setDragState((prev) => ({ ...prev, isDragging: false, offsetX: 0, offsetY: 0 }))
    },
    [dragState, onFlip, onSwipeKnow, onSwipeUnknown],
  )

  // Reset exit direction when card changes
  useEffect(() => {
    setExitDir(null)
  }, [card.word])

  // -- Transform calculations --
  const translateX = exitDir === 'right' ? 400 : exitDir === 'left' ? -400 : dragState.offsetX
  const translateY = exitDir
    ? -40
    : dragState.isDragging
      ? dragState.offsetY * 0.3
      : 0
  const rotate = exitDir === 'right' ? 18 : exitDir === 'left' ? -18 : dragState.offsetX * 0.06
  const scale = exitDir ? 0.92 : dragState.isDragging ? 0.97 : 1

  const cardTransform = `translate(${translateX}px, ${translateY}px) rotate(${rotate}deg) scale(${scale})`
  const isTransitioning = !dragState.isDragging || !!exitDir

  return (
    <div className="relative w-full select-none">
      {/* Stacked cards behind */}
      <div className="relative mx-auto" style={{ maxWidth: 340, perspective: 800 }}>
        {/* Back card 2 */}
        <div
          className="absolute inset-x-3 top-2 h-[420px] rounded-[24px] border border-white/10"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,132,0,0.04) 100%)',
            backdropFilter: 'blur(12px)',
            transform: 'scale(0.92) translateY(8px)',
            opacity: 0.4,
          }}
        />
        {/* Back card 1 */}
        <div
          className="absolute inset-x-1.5 top-1 h-[420px] rounded-[24px] border border-white/10"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,132,0,0.06) 100%)',
            backdropFilter: 'blur(16px)',
            transform: 'scale(0.96) translateY(4px)',
            opacity: 0.6,
          }}
        />

        {/* Main card */}
        <div
          ref={cardRef}
          className="relative h-[420px] rounded-[24px] overflow-hidden touch-none cursor-grab active:cursor-grabbing"
          style={{
            transform: cardTransform,
            transition: isTransitioning ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
            transformStyle: 'preserve-3d',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Glass card surface */}
          <div
            className="absolute inset-0 rounded-[24px] border border-white/[0.18]"
            style={{
              background: 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,132,0,0.08) 40%, rgba(255,255,255,0.05) 100%)',
              backdropFilter: 'blur(40px)',
              boxShadow: `
                0 8px 32px rgba(0,0,0,0.08),
                0 2px 8px rgba(255,132,0,0.06),
                inset 0 1px 0 rgba(255,255,255,0.2),
                inset 0 -1px 0 rgba(0,0,0,0.05)
              `,
            }}
          />

          {/* Subtle top-left glow */}
          <div
            className="absolute -top-12 -left-12 w-48 h-48 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,132,0,0.12) 0%, transparent 70%)',
            }}
          />

          {/* Card content */}
          <div className="relative z-10 h-full flex flex-col p-6">
            {!flipped ? (
              /* ===== FRONT SIDE ===== */
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)] mb-6 opacity-80">
                  Flashcard
                </span>

                <h2 className="text-[36px] font-bold text-[var(--color-foreground)] leading-tight mb-2 font-secondary">
                  {card.word}
                </h2>

                {card.phonetic && (
                  <p className="text-[15px] text-[var(--color-muted)] mb-6">{card.phonetic}</p>
                )}

                <p className="text-[12px] text-[var(--color-muted)] mt-6">点击翻转</p>
              </div>
            ) : (
              /* ===== BACK SIDE ===== */
              <div className="flex-1 flex flex-col overflow-hidden">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)] mb-3 opacity-80">
                  Meaning
                </span>

                <h3 className="text-[22px] font-bold text-[var(--color-foreground)] mb-1 font-secondary">
                  {card.word}
                </h3>
                <p className="text-[18px] font-semibold text-[var(--color-primary)] mb-4">
                  {card.meaning || '暂无释义'}
                </p>

                {/* AI Mnemonic */}
                <div
                  className="rounded-[14px] px-4 py-3 mb-3 flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,132,0,0.08), rgba(255,132,0,0.03))',
                    border: '1px solid rgba(255,132,0,0.12)',
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lightbulb size={13} className="text-[var(--color-primary)]" />
                    <span className="text-[11px] font-semibold text-[var(--color-primary)]">AI 助记</span>
                  </div>
                  {mnemonicLoading ? (
                    <div className="flex items-center gap-2 text-[12px] text-[var(--color-muted)]">
                      <Loader2 size={13} className="animate-spin" /> 正在生成形象记忆...
                    </div>
                  ) : (
                    <p className="text-[13px] leading-[1.6] text-[var(--color-foreground)]">
                      {mnemonic?.trim() ||
                        `把 ${card.word} 想成一个夸张鲜明的小场景，再和"${card.meaning || '它的意思'}"牢牢绑在一起。`}
                    </p>
                  )}
                </div>

                {/* Example sentence */}
                {card.example?.trim() && (
                  <div
                    className="rounded-[14px] px-4 py-3 mb-3 flex-shrink-0"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)] mb-1">
                      Example
                    </p>
                    <p className="text-[13px] leading-[1.6] text-[var(--color-foreground)] italic">
                      "{card.example}"
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edge gradient glow — fixed to screen edges, full height */}
      <div
        className="pointer-events-none fixed inset-y-0 left-0 z-50"
        style={{
          width: 40 + swipeProgress * 20,
          background: `linear-gradient(to right, rgba(239,68,68,${swipeIntent === 'unknown' ? 0.35 + swipeProgress * 0.55 : 0}), transparent)`,
          boxShadow: swipeIntent === 'unknown' ? `0 0 ${24 + swipeProgress * 24}px rgba(239,68,68,${swipeProgress * 0.4})` : 'none',
          transition: swipeIntent === 'unknown' ? 'none' : 'all 0.2s ease',
        }}
      />
      <div
        className="pointer-events-none fixed inset-y-0 right-0 z-50"
        style={{
          width: 40 + swipeProgress * 20,
          background: `linear-gradient(to left, rgba(34,197,94,${swipeIntent === 'know' ? 0.35 + swipeProgress * 0.55 : 0}), transparent)`,
          boxShadow: swipeIntent === 'know' ? `0 0 ${24 + swipeProgress * 24}px rgba(34,197,94,${swipeProgress * 0.4})` : 'none',
          transition: swipeIntent === 'know' ? 'none' : 'all 0.2s ease',
        }}
      />
    </div>
  )
}
