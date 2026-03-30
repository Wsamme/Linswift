const KEYBOARD_SFX_STORAGE_KEY = 'linswift_spelling_sound'

let sharedAudioContext: AudioContext | null = null

function createAudioContext() {
  const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return AudioCtor ? new AudioCtor() : null
}

function getAudioContext() {
  if (typeof window === 'undefined') return null
  sharedAudioContext = sharedAudioContext || createAudioContext()
  if (sharedAudioContext?.state === 'suspended') {
    sharedAudioContext.resume().catch(() => {})
  }
  return sharedAudioContext
}

function shapeEnvelope(gain: GainNode, now: number, peak: number, attack: number, release: number) {
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release)
}

function playLayer(
  ctx: AudioContext,
  {
    type,
    frequency,
    gainValue,
    duration,
    detune = 0,
    endFrequency,
    attack = 0.004,
  }: {
    type: OscillatorType
    frequency: number
    gainValue: number
    duration: number
    detune?: number
    endFrequency?: number
    attack?: number
  }
) {
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.detune.setValueAtTime(detune, now)
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration)
  }

  shapeEnvelope(gain, now, gainValue, attack, duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + duration + 0.01)
}

export function isKeyboardSfxEnabled() {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(KEYBOARD_SFX_STORAGE_KEY)
  return raw === null ? true : raw === '1'
}

export function playKeyboardTapSound(key: string, sequence = 0) {
  if (!isKeyboardSfxEnabled()) return

  const ctx = getAudioContext()
  if (!ctx) return

  const lower = key.toLowerCase()
  if (lower === 'backspace') {
    playLayer(ctx, { type: 'triangle', frequency: 190, endFrequency: 135, gainValue: 0.02, duration: 0.06 })
    playLayer(ctx, { type: 'sine', frequency: 120, endFrequency: 90, gainValue: 0.01, duration: 0.08, detune: -4 })
    return
  }

  if (!/^[a-z]$/.test(lower)) return

  const code = lower.charCodeAt(0) - 97
  const rhythmOffsets = [0, 19, 33, 12]
  const accentPattern = [1, 0.92, 1.06, 0.96]
  const rhythmicStep = ((sequence % rhythmOffsets.length) + rhythmOffsets.length) % rhythmOffsets.length
  const pulse = accentPattern[rhythmicStep]
  const baseFrequency = 250 + (code % 7) * 24 + Math.floor(code / 7) * 11 + rhythmOffsets[rhythmicStep]
  const clickType: OscillatorType[] = ['triangle', 'sine', 'triangle', 'square']

  playLayer(ctx, {
    type: clickType[rhythmicStep],
    frequency: baseFrequency,
    endFrequency: baseFrequency * 1.16,
    gainValue: 0.016 * pulse,
    duration: 0.045,
  })

  playLayer(ctx, {
    type: 'sine',
    frequency: baseFrequency * 1.98,
    endFrequency: baseFrequency * 1.55,
    gainValue: 0.0075 * pulse,
    duration: 0.032,
    detune: (code % 3 - 1) * 5,
    attack: 0.002,
  })
}

export function playKeyboardSuccessSound(isFinal = false) {
  if (!isKeyboardSfxEnabled()) return

  const ctx = getAudioContext()
  if (!ctx) return

  playLayer(ctx, { type: 'triangle', frequency: 520, endFrequency: 660, gainValue: 0.026, duration: 0.09 })
  window.setTimeout(() => {
    playLayer(ctx, { type: 'sine', frequency: isFinal ? 880 : 740, endFrequency: isFinal ? 1040 : 840, gainValue: 0.022, duration: 0.11 })
  }, 65)
}

export { KEYBOARD_SFX_STORAGE_KEY }
