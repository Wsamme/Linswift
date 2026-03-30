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

export function isKeyboardSfxEnabled() {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(KEYBOARD_SFX_STORAGE_KEY)
  return raw === null ? true : raw === '1'
}

// ── Piano note frequencies (C major pentatonic across 2 octaves) ──
// Pentatonic scale sounds pleasant no matter which keys are hit
const PIANO_NOTES = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
  1046.50, // C6
  1174.66, // D6
  1318.51, // E6
]

// Map a-z to notes: QWERTY layout rows give different octave ranges
const KEY_NOTE_MAP: Record<string, number> = {}
;(() => {
  // Bottom row (lower notes): z x c v b n m
  const bottom = 'zxcvbnm'
  // Middle row (mid notes): a s d f g h j k l
  const middle = 'asdfghjkl'
  // Top row (higher notes): q w e r t y u i o p
  const top = 'qwertyuiop'

  bottom.split('').forEach((k, i) => {
    KEY_NOTE_MAP[k] = PIANO_NOTES[i % PIANO_NOTES.length]
  })
  middle.split('').forEach((k, i) => {
    KEY_NOTE_MAP[k] = PIANO_NOTES[(i + 3) % PIANO_NOTES.length]
  })
  top.split('').forEach((k, i) => {
    KEY_NOTE_MAP[k] = PIANO_NOTES[(i + 5) % PIANO_NOTES.length]
  })
})()

// ── Piano voice: fundamental + harmonics with natural decay ──
function playPianoNote(ctx: AudioContext, frequency: number, velocity = 0.7) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, now)
  master.connect(ctx.destination)

  // Harmonic structure: fundamental is loudest, overtones decay
  const harmonics = [
    { ratio: 1,    amp: 1.0,   decay: 0.8  },  // fundamental
    { ratio: 2,    amp: 0.45,  decay: 0.55 },  // 2nd harmonic
    { ratio: 3,    amp: 0.18,  decay: 0.4  },  // 3rd
    { ratio: 4,    amp: 0.08,  decay: 0.3  },  // 4th
    { ratio: 5.02, amp: 0.03,  decay: 0.2  },  // 5th (slightly detuned for warmth)
  ]

  const peak = 0.035 * velocity
  const attack = 0.003

  // Quick master envelope for the overall shape
  master.gain.exponentialRampToValueAtTime(peak, now + attack)
  master.gain.setTargetAtTime(peak * 0.6, now + attack, 0.08)
  master.gain.setTargetAtTime(0.0001, now + 0.15, 0.25)

  for (const h of harmonics) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency * h.ratio, now)
    // Slight random detune for natural feel (±2 cents)
    osc.detune.setValueAtTime((Math.random() - 0.5) * 4, now)

    const harmonicPeak = h.amp
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(harmonicPeak, now + attack)
    // Each harmonic decays at its own rate (higher harmonics die faster)
    gain.gain.setTargetAtTime(0.0001, now + attack, h.decay)

    osc.connect(gain)
    gain.connect(master)
    osc.start(now)
    osc.stop(now + h.decay * 5 + 0.1)
  }

  // Hammer knock — very short noise burst for attack realism
  const noiseLen = 512
  const noiseBuffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseLen; i++) {
    noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen)
  }
  const noiseSrc = ctx.createBufferSource()
  noiseSrc.buffer = noiseBuffer
  const noiseGain = ctx.createGain()
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.setValueAtTime(frequency * 2.5, now)
  noiseFilter.Q.setValueAtTime(2, now)
  noiseGain.gain.setValueAtTime(0.012 * velocity, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
  noiseSrc.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(master)
  noiseSrc.start(now)
  noiseSrc.stop(now + 0.03)
}

export function playKeyboardTapSound(key: string, _sequence = 0) {
  if (!isKeyboardSfxEnabled()) return

  const ctx = getAudioContext()
  if (!ctx) return

  const lower = key.toLowerCase()

  if (lower === 'backspace') {
    // Soft muted thud for delete
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(160, now)
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.06)
    gain.gain.setValueAtTime(0.015, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.07)
    return
  }

  if (!/^[a-z]$/.test(lower)) return

  const freq = KEY_NOTE_MAP[lower] || 440
  // Slight velocity variation for natural feel
  const velocity = 0.6 + Math.random() * 0.35
  playPianoNote(ctx, freq, velocity)
}

export function playKeyboardSuccessSound(isFinal = false) {
  if (!isKeyboardSfxEnabled()) return

  const ctx = getAudioContext()
  if (!ctx) return

  // Play a pleasant chord: C major (or C major 7th for final)
  const baseVelocity = 0.5
  if (isFinal) {
    // C-E-G-C (bright major chord, higher octave)
    playPianoNote(ctx, 523.25, baseVelocity)
    setTimeout(() => playPianoNote(ctx, 659.25, baseVelocity * 0.8), 30)
    setTimeout(() => playPianoNote(ctx, 783.99, baseVelocity * 0.7), 60)
    setTimeout(() => playPianoNote(ctx, 1046.50, baseVelocity * 0.9), 90)
  } else {
    // G-B arpeggio (quick two-note)
    playPianoNote(ctx, 392.00, baseVelocity * 0.7)
    setTimeout(() => playPianoNote(ctx, 493.88, baseVelocity * 0.8), 50)
  }
}

export { KEYBOARD_SFX_STORAGE_KEY }
