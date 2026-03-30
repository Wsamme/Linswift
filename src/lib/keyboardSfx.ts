const KEYBOARD_SFX_STORAGE_KEY = 'linswift_spelling_sound'
const KEYBOARD_SFX_TYPE_KEY = 'linswift_spelling_sound_type'

export type SfxType = 'piano' | 'drum' | 'guitar' | 'marimba' | 'synth' | 'typewriter'

export const SFX_OPTIONS: { value: SfxType; label: string; emoji: string }[] = [
  { value: 'piano',      label: '钢琴',   emoji: '🎹' },
  { value: 'guitar',     label: '吉他',   emoji: '🎸' },
  { value: 'drum',       label: '架子鼓', emoji: '🥁' },
  { value: 'marimba',    label: '木琴',   emoji: '🎵' },
  { value: 'synth',      label: '合成器', emoji: '🎛️' },
  { value: 'typewriter', label: '打字机', emoji: '⌨️' },
]

let sharedAudioContext: AudioContext | null = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!sharedAudioContext) {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    sharedAudioContext = Ctor ? new Ctor() : null
  }
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

export function getSfxType(): SfxType {
  if (typeof window === 'undefined') return 'piano'
  return (localStorage.getItem(KEYBOARD_SFX_TYPE_KEY) as SfxType) || 'piano'
}

export function setSfxType(type: SfxType) {
  localStorage.setItem(KEYBOARD_SFX_TYPE_KEY, type)
}

// ── Note mapping: C major scale across 3 octaves ──
// Follows the QWERTY keyboard layout like a real instrument:
//   Bottom row (Z-M)  = Low octave:    Do Re Mi Fa Sol La Si
//   Home row  (A-L)   = Middle octave: Do Re Mi Fa Sol La Si Do Re
//   Top row   (Q-P)   = High octave:   Do Re Mi Fa Sol La Si Do Re Mi
//
// C major: C D E F G A B
const NOTE_FREQS = {
  // Octave 3 (low)
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  // Octave 4 (middle)
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  // Octave 5 (high)
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  // Octave 6 (highest)
  C6: 1046.50, D6: 1174.66, E6: 1318.51,
}

const KEY_FREQ: Record<string, number> = {
  // Bottom row: low octave (Do Re Mi Fa Sol La Si)
  z: NOTE_FREQS.C3, x: NOTE_FREQS.D3, c: NOTE_FREQS.E3, v: NOTE_FREQS.F3,
  b: NOTE_FREQS.G3, n: NOTE_FREQS.A3, m: NOTE_FREQS.B3,
  // Home row: middle octave (Do Re Mi Fa Sol La Si Do Re)
  a: NOTE_FREQS.C4, s: NOTE_FREQS.D4, d: NOTE_FREQS.E4, f: NOTE_FREQS.F4,
  g: NOTE_FREQS.G4, h: NOTE_FREQS.A4, j: NOTE_FREQS.B4, k: NOTE_FREQS.C5, l: NOTE_FREQS.D5,
  // Top row: high octave (Do Re Mi Fa Sol La Si Do Re Mi)
  q: NOTE_FREQS.C5, w: NOTE_FREQS.D5, e: NOTE_FREQS.E5, r: NOTE_FREQS.F5,
  t: NOTE_FREQS.G5, y: NOTE_FREQS.A5, u: NOTE_FREQS.B5, i: NOTE_FREQS.C6, o: NOTE_FREQS.D6, p: NOTE_FREQS.E6,
}

function getFreq(key: string) {
  return KEY_FREQ[key.toLowerCase()] || NOTE_FREQS.A4
}

// ── Noise helper ──
function noiseBuffer(ctx: AudioContext, len: number): AudioBuffer {
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  return buf
}

// ════════════════════════════════════════════════
// 1. PIANO — harmonics + hammer noise + long decay
// ════════════════════════════════════════════════
function playPiano(ctx: AudioContext, freq: number, vel: number) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.035 * vel, now + 0.003)
  master.gain.setTargetAtTime(0.02 * vel, now + 0.003, 0.08)
  master.gain.setTargetAtTime(0.0001, now + 0.15, 0.25)

  const harmonics = [
    { r: 1, a: 1.0, d: 0.8 }, { r: 2, a: 0.45, d: 0.55 },
    { r: 3, a: 0.18, d: 0.4 }, { r: 4, a: 0.08, d: 0.3 }, { r: 5.02, a: 0.03, d: 0.2 },
  ]
  for (const h of harmonics) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq * h.r, now)
    o.detune.setValueAtTime((Math.random() - 0.5) * 4, now)
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(h.a, now + 0.003)
    g.gain.setTargetAtTime(0.0001, now + 0.003, h.d)
    o.connect(g).connect(master)
    o.start(now)
    o.stop(now + h.d * 5 + 0.1)
  }
  // Hammer click
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, 512)
  const ng = ctx.createGain()
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'; nf.frequency.value = freq * 2.5; nf.Q.value = 2
  ng.gain.setValueAtTime(0.012 * vel, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
  ns.connect(nf).connect(ng).connect(master)
  ns.start(now); ns.stop(now + 0.03)
}

// ════════════════════════════════════════════════
// 2. GUITAR — Karplus-Strong plucked string synthesis
//    Fills a buffer with noise, then repeatedly averages
//    adjacent samples to simulate a vibrating string.
// ════════════════════════════════════════════════
function playGuitar(ctx: AudioContext, freq: number, vel: number) {
  const sampleRate = ctx.sampleRate
  // String period in samples
  const period = Math.round(sampleRate / freq)
  // Total duration ~1.2s
  const totalSamples = Math.round(sampleRate * 1.2)
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate)
  const data = buffer.getChannelData(0)

  // Initialize the "string" with noise burst (pluck energy)
  // Use a mix of white noise + slight bias toward waveform for brightness
  for (let i = 0; i < period; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.8
  }

  // Karplus-Strong: each new sample = average of two samples one period ago
  // with a damping factor to simulate string losing energy
  const damping = 0.996 // Controls how long the string rings
  const brightness = 0.4 + Math.random() * 0.15 // Blend between pure average and previous sample
  for (let i = period; i < totalSamples; i++) {
    const prev = data[i - period]
    const prevPrev = data[i - period + 1] || data[i - period]
    // Weighted average: smoother = more damped highs (like a nylon string)
    // Less smooth = brighter/metallic (like a steel string)
    data[i] = damping * ((1 - brightness) * prev + brightness * (prev + prevPrev) * 0.5)
  }

  // Shape the overall envelope: fast attack, natural decay
  const attackSamples = Math.round(sampleRate * 0.002)
  for (let i = 0; i < attackSamples && i < totalSamples; i++) {
    data[i] *= i / attackSamples
  }

  const src = ctx.createBufferSource()
  src.buffer = buffer

  // Body resonance filter (simulates guitar body)
  const bodyFilter = ctx.createBiquadFilter()
  bodyFilter.type = 'peaking'
  bodyFilter.frequency.setValueAtTime(freq < 300 ? 250 : 400, ctx.currentTime)
  bodyFilter.Q.setValueAtTime(1.5, ctx.currentTime)
  bodyFilter.gain.setValueAtTime(3, ctx.currentTime)

  // Brightness filter — slight high cut for warmth
  const toneFilter = ctx.createBiquadFilter()
  toneFilter.type = 'lowpass'
  toneFilter.frequency.setValueAtTime(freq * 5, ctx.currentTime)
  toneFilter.Q.setValueAtTime(0.5, ctx.currentTime)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.06 * vel, ctx.currentTime)

  src.connect(bodyFilter).connect(toneFilter).connect(gain).connect(ctx.destination)
  src.start(ctx.currentTime)
  src.stop(ctx.currentTime + 1.2)
}

// ════════════════════════════════════════════════
// 3. DRUM — kick/snare/hat based on keyboard row
// ════════════════════════════════════════════════
function playDrum(ctx: AudioContext, freq: number, vel: number) {
  const now = ctx.currentTime
  // Use frequency range to pick drum type
  // Low freq → kick, mid → snare, high → hi-hat
  if (freq < 350) {
    // Kick drum
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, now)
    o.frequency.exponentialRampToValueAtTime(40, now + 0.12)
    g.gain.setValueAtTime(0.06 * vel, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
    o.connect(g).connect(ctx.destination)
    o.start(now); o.stop(now + 0.25)
    // Punch noise
    const ns = ctx.createBufferSource()
    ns.buffer = noiseBuffer(ctx, 128)
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.02 * vel, now)
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
    ns.connect(ng).connect(ctx.destination)
    ns.start(now); ns.stop(now + 0.04)
  } else if (freq < 700) {
    // Snare
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'triangle'
    o.frequency.setValueAtTime(200 + Math.random() * 40, now)
    g.gain.setValueAtTime(0.03 * vel, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    o.connect(g).connect(ctx.destination)
    o.start(now); o.stop(now + 0.12)
    // Snare rattle (noise)
    const ns = ctx.createBufferSource()
    ns.buffer = noiseBuffer(ctx, 2048)
    const nf = ctx.createBiquadFilter()
    nf.type = 'highpass'; nf.frequency.value = 2000
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.035 * vel, now)
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    ns.connect(nf).connect(ng).connect(ctx.destination)
    ns.start(now); ns.stop(now + 0.1)
  } else {
    // Hi-hat
    const ns = ctx.createBufferSource()
    ns.buffer = noiseBuffer(ctx, 1024)
    const nf = ctx.createBiquadFilter()
    nf.type = 'highpass'; nf.frequency.value = 6000
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.025 * vel, now)
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
    ns.connect(nf).connect(ng).connect(ctx.destination)
    ns.start(now); ns.stop(now + 0.05)
  }
}

// ════════════════════════════════════════════════
// 4. MARIMBA — wooden mallet hit, warm sine + fast decay
// ════════════════════════════════════════════════
function playMarimba(ctx: AudioContext, freq: number, vel: number) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.045 * vel, now + 0.002)
  master.gain.setTargetAtTime(0.0001, now + 0.002, 0.18)

  // Fundamental (strong)
  const o1 = ctx.createOscillator()
  o1.type = 'sine'
  o1.frequency.setValueAtTime(freq, now)
  const g1 = ctx.createGain()
  g1.gain.setValueAtTime(1.0, now)
  g1.gain.setTargetAtTime(0.0001, now, 0.3)
  o1.connect(g1).connect(master)
  o1.start(now); o1.stop(now + 1.5)

  // 4x harmonic (characteristic marimba overtone)
  const o2 = ctx.createOscillator()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(freq * 4, now)
  const g2 = ctx.createGain()
  g2.gain.setValueAtTime(0.25, now)
  g2.gain.setTargetAtTime(0.0001, now, 0.08)
  o2.connect(g2).connect(master)
  o2.start(now); o2.stop(now + 0.5)

  // 10x harmonic (brightness)
  const o3 = ctx.createOscillator()
  o3.type = 'sine'
  o3.frequency.setValueAtTime(freq * 9.95, now)
  const g3 = ctx.createGain()
  g3.gain.setValueAtTime(0.06, now)
  g3.gain.setTargetAtTime(0.0001, now, 0.03)
  o3.connect(g3).connect(master)
  o3.start(now); o3.stop(now + 0.2)

  // Mallet thump
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, 128)
  const ng = ctx.createGain()
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'; nf.frequency.value = 800
  ng.gain.setValueAtTime(0.02 * vel, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.012)
  ns.connect(nf).connect(ng).connect(master)
  ns.start(now); ns.stop(now + 0.02)
}

// ════════════════════════════════════════════════
// 5. SYNTH — retro sawtooth with filter sweep
// ════════════════════════════════════════════════
function playSynth(ctx: AudioContext, freq: number, vel: number) {
  const now = ctx.currentTime
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(freq, now)
  o.detune.setValueAtTime((Math.random() - 0.5) * 10, now)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(freq * 6, now)
  filter.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.2)
  filter.Q.setValueAtTime(3, now)

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.03 * vel, now + 0.005)
  g.gain.setTargetAtTime(0.02 * vel, now + 0.005, 0.05)
  g.gain.setTargetAtTime(0.0001, now + 0.1, 0.12)

  // Sub oscillator for thickness
  const sub = ctx.createOscillator()
  sub.type = 'square'
  sub.frequency.setValueAtTime(freq * 0.5, now)
  const sg = ctx.createGain()
  sg.gain.setValueAtTime(0.3, now)

  o.connect(filter)
  sub.connect(sg).connect(filter)
  filter.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + 0.8)
  sub.start(now); sub.stop(now + 0.8)
}

// ════════════════════════════════════════════════
// 6. TYPEWRITER — mechanical click + bell
// ════════════════════════════════════════════════
function playTypewriter(ctx: AudioContext, _freq: number, vel: number) {
  const now = ctx.currentTime
  // Mechanical click — short filtered noise
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, 256)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.frequency.setValueAtTime(3000 + Math.random() * 1000, now)
  nf.Q.setValueAtTime(4, now)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.04 * vel, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
  ns.connect(nf).connect(ng).connect(ctx.destination)
  ns.start(now); ns.stop(now + 0.025)

  // Mechanical lever thud
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(400 + Math.random() * 100, now)
  o.frequency.exponentialRampToValueAtTime(120, now + 0.03)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.015 * vel, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.035)
  o.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + 0.04)
}

// ── Dispatcher ──
const PLAYERS: Record<SfxType, (ctx: AudioContext, freq: number, vel: number) => void> = {
  piano: playPiano,
  guitar: playGuitar,
  drum: playDrum,
  marimba: playMarimba,
  synth: playSynth,
  typewriter: playTypewriter,
}

export function playKeyboardTapSound(key: string, _sequence = 0) {
  if (!isKeyboardSfxEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const lower = key.toLowerCase()
  if (lower === 'backspace') {
    const now = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(160, now)
    o.frequency.exponentialRampToValueAtTime(80, now + 0.06)
    g.gain.setValueAtTime(0.015, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    o.connect(g).connect(ctx.destination)
    o.start(now); o.stop(now + 0.07)
    return
  }

  if (!/^[a-z]$/.test(lower)) return

  const freq = getFreq(lower)
  const vel = 0.6 + Math.random() * 0.35
  const type = getSfxType()
  PLAYERS[type](ctx, freq, vel)
}

export function playKeyboardSuccessSound(isFinal = false) {
  if (!isKeyboardSfxEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  const type = getSfxType()
  const play = PLAYERS[type]
  if (isFinal) {
    play(ctx, 523.25, 0.5)
    setTimeout(() => play(ctx, 659.25, 0.4), 30)
    setTimeout(() => play(ctx, 783.99, 0.35), 60)
    setTimeout(() => play(ctx, 1046.50, 0.45), 90)
  } else {
    play(ctx, 392.00, 0.35)
    setTimeout(() => play(ctx, 493.88, 0.4), 50)
  }
}

export { KEYBOARD_SFX_STORAGE_KEY, KEYBOARD_SFX_TYPE_KEY }
