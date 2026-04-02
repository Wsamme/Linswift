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
// 3. DRUM — Full kit: each key = different drum piece
//    Bottom row: kick, floor tom, low tom
//    Home row:  snare, rim, clap, mid tom, hi tom
//    Top row:   hi-hat, crash, ride, splash cymbals
// ════════════════════════════════════════════════

// Map each key to a specific drum piece
const DRUM_MAP: Record<string, string> = {
  // Bottom row: deep/low drums
  z: 'kick', x: 'kick-hard', c: 'floor-tom', v: 'floor-tom-high',
  b: 'low-tom', n: 'low-tom-high', m: 'mid-tom',
  // Home row: snares, toms, claps
  a: 'snare', s: 'snare-rim', d: 'clap', f: 'mid-tom-high',
  g: 'hi-tom', h: 'hi-tom-high', j: 'snare-ghost', k: 'cross-stick', l: 'cowbell',
  // Top row: cymbals
  q: 'hi-hat-closed', w: 'hi-hat-open', e: 'hi-hat-pedal', r: 'crash',
  t: 'crash-choke', y: 'ride', u: 'ride-bell', i: 'splash', o: 'china', p: 'bell',
}

function drumKick(ctx: AudioContext, now: number, vel: number, startFreq: number, endFreq: number, dur: number) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(startFreq, now)
  o.frequency.exponentialRampToValueAtTime(endFreq, now + dur * 0.7)
  g.gain.setValueAtTime(0.08 * vel, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  o.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + dur + 0.01)
  // Click transient
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, 256)
  const nf = ctx.createBiquadFilter()
  nf.type = 'lowpass'; nf.frequency.value = 400
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.04 * vel, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
  ns.connect(nf).connect(ng).connect(ctx.destination)
  ns.start(now); ns.stop(now + 0.03)
}

function drumTom(ctx: AudioContext, now: number, vel: number, pitch: number, decay: number) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(pitch, now)
  o.frequency.exponentialRampToValueAtTime(pitch * 0.65, now + decay)
  g.gain.setValueAtTime(0.055 * vel, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + decay)
  o.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + decay + 0.01)
  // Skin attack
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, 512)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'; nf.frequency.value = pitch * 2; nf.Q.value = 1
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.025 * vel, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
  ns.connect(nf).connect(ng).connect(ctx.destination)
  ns.start(now); ns.stop(now + 0.04)
}

function drumSnare(ctx: AudioContext, now: number, vel: number, toneFreq: number, noiseAmount: number, decay: number) {
  // Tone body
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(toneFreq, now)
  g.gain.setValueAtTime(0.04 * vel, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + decay * 0.6)
  o.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + decay)
  // Wire rattle
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, Math.round(ctx.sampleRate * decay))
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'; nf.frequency.value = 4500; nf.Q.value = 1.2
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(noiseAmount * vel, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + decay)
  ns.connect(nf).connect(ng).connect(ctx.destination)
  ns.start(now); ns.stop(now + decay + 0.01)
}

function drumCymbal(ctx: AudioContext, now: number, vel: number, brightness: number, decay: number) {
  // Cymbals = layered filtered noise at different bands
  const bands = [brightness, brightness * 1.5, brightness * 2.2, brightness * 3]
  for (const freq of bands) {
    const ns = ctx.createBufferSource()
    ns.buffer = noiseBuffer(ctx, Math.round(ctx.sampleRate * decay))
    const nf = ctx.createBiquadFilter()
    nf.type = 'bandpass'; nf.frequency.value = freq; nf.Q.value = 2 + Math.random()
    const ng = ctx.createGain()
    const amp = 0.015 * vel * (1 - (freq - brightness) / (brightness * 3))
    ng.gain.setValueAtTime(amp, now)
    ng.gain.setTargetAtTime(0.0001, now + 0.005, decay * 0.3)
    ns.connect(nf).connect(ng).connect(ctx.destination)
    ns.start(now); ns.stop(now + decay + 0.1)
  }
  // Metallic ping
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'square'
  o.frequency.setValueAtTime(brightness * 0.8, now)
  g.gain.setValueAtTime(0.008 * vel, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
  o.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + 0.06)
}

function playDrum(ctx: AudioContext, freq: number, vel: number) {
  const now = ctx.currentTime
  // Find which key was pressed based on frequency → drum piece
  let piece = 'snare'
  for (const [key, drumName] of Object.entries(DRUM_MAP)) {
    if (Math.abs(KEY_FREQ[key] - freq) < 0.5) { piece = drumName; break }
  }

  switch (piece) {
    case 'kick':           drumKick(ctx, now, vel, 160, 35, 0.25); break
    case 'kick-hard':      drumKick(ctx, now, vel, 200, 30, 0.35); break
    case 'floor-tom':      drumTom(ctx, now, vel, 90, 0.4); break
    case 'floor-tom-high': drumTom(ctx, now, vel, 110, 0.35); break
    case 'low-tom':        drumTom(ctx, now, vel, 140, 0.3); break
    case 'low-tom-high':   drumTom(ctx, now, vel, 170, 0.28); break
    case 'mid-tom':        drumTom(ctx, now, vel, 210, 0.25); break
    case 'mid-tom-high':   drumTom(ctx, now, vel, 260, 0.22); break
    case 'hi-tom':         drumTom(ctx, now, vel, 320, 0.2); break
    case 'hi-tom-high':    drumTom(ctx, now, vel, 400, 0.18); break
    case 'snare':          drumSnare(ctx, now, vel, 200, 0.045, 0.15); break
    case 'snare-rim':      drumSnare(ctx, now, vel, 300, 0.02, 0.08); break
    case 'snare-ghost':    drumSnare(ctx, now, vel * 0.4, 180, 0.03, 0.1); break
    case 'cross-stick': {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.setValueAtTime(800, now)
      g.gain.setValueAtTime(0.04 * vel, now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
      o.connect(g).connect(ctx.destination); o.start(now); o.stop(now + 0.05)
      break
    }
    case 'clap': {
      // Layered noise bursts with slight delays
      for (let i = 0; i < 3; i++) {
        const ns = ctx.createBufferSource()
        ns.buffer = noiseBuffer(ctx, 512)
        const nf = ctx.createBiquadFilter()
        nf.type = 'bandpass'; nf.frequency.value = 1200 + i * 400; nf.Q.value = 1
        const ng = ctx.createGain()
        const t = now + i * 0.008
        ng.gain.setValueAtTime(0.04 * vel, t)
        ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
        ns.connect(nf).connect(ng).connect(ctx.destination)
        ns.start(t); ns.stop(t + 0.07)
      }
      break
    }
    case 'cowbell': {
      const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator()
      const g = ctx.createGain()
      o1.type = 'square'; o1.frequency.value = 560
      o2.type = 'square'; o2.frequency.value = 845
      g.gain.setValueAtTime(0.025 * vel, now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
      o1.connect(g); o2.connect(g); g.connect(ctx.destination)
      o1.start(now); o2.start(now); o1.stop(now + 0.16); o2.stop(now + 0.16)
      break
    }
    case 'hi-hat-closed':  drumCymbal(ctx, now, vel, 6000, 0.05); break
    case 'hi-hat-open':    drumCymbal(ctx, now, vel, 5000, 0.4); break
    case 'hi-hat-pedal':   drumCymbal(ctx, now, vel, 6500, 0.03); break
    case 'crash':          drumCymbal(ctx, now, vel, 3000, 0.8); break
    case 'crash-choke':    drumCymbal(ctx, now, vel, 3500, 0.12); break
    case 'ride':           drumCymbal(ctx, now, vel, 4500, 0.6); break
    case 'ride-bell':      drumCymbal(ctx, now, vel, 5500, 0.3); break
    case 'splash':         drumCymbal(ctx, now, vel, 7000, 0.25); break
    case 'china':          drumCymbal(ctx, now, vel, 2500, 0.5); break
    case 'bell': {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = 1200
      g.gain.setValueAtTime(0.03 * vel, now)
      g.gain.setTargetAtTime(0.0001, now + 0.01, 0.15)
      o.connect(g).connect(ctx.destination); o.start(now); o.stop(now + 0.8)
      break
    }
    default: drumSnare(ctx, now, vel, 200, 0.04, 0.12)
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
function playTypewriter(ctx: AudioContext, freq: number, vel: number) {
  const now = ctx.currentTime

  // Each key has a slightly different mechanical character
  // Use freq to seed random variations so same key = consistent sound
  const seed = Math.round(freq) % 7
  const clickPitch = 2200 + seed * 350 + (Math.random() - 0.5) * 200
  const thudPitch = 280 + seed * 40 + (Math.random() - 0.5) * 60
  const clickQ = 3 + seed * 0.5
  const clickDur = 0.012 + seed * 0.002 + Math.random() * 0.004
  const thudDur = 0.02 + seed * 0.003
  const clickVol = (0.035 + Math.random() * 0.015) * vel
  const thudVol = (0.012 + Math.random() * 0.008) * vel

  // Key down click — sharp filtered noise (the switch contact)
  const ns = ctx.createBufferSource()
  ns.buffer = noiseBuffer(ctx, 384)
  const nf = ctx.createBiquadFilter()
  nf.type = 'bandpass'
  nf.frequency.setValueAtTime(clickPitch, now)
  nf.Q.setValueAtTime(clickQ, now)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(clickVol, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + clickDur)
  ns.connect(nf).connect(ng).connect(ctx.destination)
  ns.start(now); ns.stop(now + clickDur + 0.005)

  // Stem/lever impact — low thud (keycap hitting the plate)
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(thudPitch, now)
  o.frequency.exponentialRampToValueAtTime(thudPitch * 0.35, now + thudDur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(thudVol, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + thudDur)
  o.connect(g).connect(ctx.destination)
  o.start(now); o.stop(now + thudDur + 0.005)

  // Spring/return noise — delayed subtle tick (the key bouncing back)
  const returnDelay = 0.025 + Math.random() * 0.015
  const ns2 = ctx.createBufferSource()
  ns2.buffer = noiseBuffer(ctx, 128)
  const nf2 = ctx.createBiquadFilter()
  nf2.type = 'bandpass'
  nf2.frequency.setValueAtTime(clickPitch * 1.3, now + returnDelay)
  nf2.Q.setValueAtTime(clickQ * 0.7, now + returnDelay)
  const ng2 = ctx.createGain()
  ng2.gain.setValueAtTime(clickVol * 0.3, now + returnDelay)
  ng2.gain.exponentialRampToValueAtTime(0.0001, now + returnDelay + 0.008)
  ns2.connect(nf2).connect(ng2).connect(ctx.destination)
  ns2.start(now + returnDelay); ns2.stop(now + returnDelay + 0.012)

  // Spacebar has extra rattle (wider keys have more resonance)
  if (seed <= 1) {
    const rattle = ctx.createBufferSource()
    rattle.buffer = noiseBuffer(ctx, 256)
    const rf = ctx.createBiquadFilter()
    rf.type = 'lowpass'; rf.frequency.value = 1200
    const rg = ctx.createGain()
    rg.gain.setValueAtTime(thudVol * 0.5, now + 0.005)
    rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
    rattle.connect(rf).connect(rg).connect(ctx.destination)
    rattle.start(now + 0.005); rattle.stop(now + 0.045)
  }
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
