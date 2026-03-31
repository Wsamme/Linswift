/**
 * Game Sound Effects — unified SFX for all learning game modes
 *
 * Sounds: flip, correct, wrong, drag, click, complete, combo
 * Toggle persisted via localStorage
 */

const GAME_SFX_KEY = 'linswift_game_sfx'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ctx = Ctor ? new Ctor() : null
  }
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function isGameSfxEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(GAME_SFX_KEY)
  return raw === null ? true : raw === '1'
}

export function setGameSfxEnabled(enabled: boolean) {
  localStorage.setItem(GAME_SFX_KEY, enabled ? '1' : '0')
}

function noise(c: AudioContext, len: number): AudioBuffer {
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  return buf
}

// ── Card Flip ──
// Short whoosh + subtle click
export function playFlipSound() {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  // Whoosh — filtered noise sweep
  const ns = c.createBufferSource()
  ns.buffer = noise(c, 1024)
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(800, now)
  f.frequency.exponentialRampToValueAtTime(2000, now + 0.08)
  f.Q.value = 1.5
  const g = c.createGain()
  g.gain.setValueAtTime(0.04, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
  ns.connect(f).connect(g).connect(c.destination)
  ns.start(now); ns.stop(now + 0.12)

  // Click
  const o = c.createOscillator()
  const og = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(600, now)
  o.frequency.exponentialRampToValueAtTime(400, now + 0.03)
  og.gain.setValueAtTime(0.02, now)
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.04)
  o.connect(og).connect(c.destination)
  o.start(now); o.stop(now + 0.05)
}

// ── Correct Answer ──
// Rising two-tone chime
export function playCorrectSound() {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  const notes = [523.25, 659.25, 783.99] // C5, E5, G5
  notes.forEach((freq, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq, now + i * 0.06)
    g.gain.setValueAtTime(0.0001, now + i * 0.06)
    g.gain.exponentialRampToValueAtTime(0.035, now + i * 0.06 + 0.01)
    g.gain.setTargetAtTime(0.0001, now + i * 0.06 + 0.01, 0.12)
    o.connect(g).connect(c.destination)
    o.start(now + i * 0.06)
    o.stop(now + i * 0.06 + 0.5)
  })
}

// ── Wrong Answer ──
// Low descending buzz
export function playWrongSound() {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(280, now)
  o.frequency.exponentialRampToValueAtTime(160, now + 0.15)
  const filt = c.createBiquadFilter()
  filt.type = 'lowpass'; filt.frequency.value = 600
  g.gain.setValueAtTime(0.04, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  o.connect(filt).connect(g).connect(c.destination)
  o.start(now); o.stop(now + 0.22)

  // Second lower tone
  const o2 = c.createOscillator()
  const g2 = c.createGain()
  o2.type = 'sawtooth'
  o2.frequency.setValueAtTime(200, now + 0.08)
  o2.frequency.exponentialRampToValueAtTime(120, now + 0.2)
  const f2 = c.createBiquadFilter()
  f2.type = 'lowpass'; f2.frequency.value = 500
  g2.gain.setValueAtTime(0.03, now + 0.08)
  g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
  o2.connect(f2).connect(g2).connect(c.destination)
  o2.start(now + 0.08); o2.stop(now + 0.27)
}

// ── Button Click ──
// Short, satisfying tap
export function playClickSound() {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(480, now)
  o.frequency.exponentialRampToValueAtTime(320, now + 0.025)
  g.gain.setValueAtTime(0.03, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)
  o.connect(g).connect(c.destination)
  o.start(now); o.stop(now + 0.04)

  // Subtle noise click
  const ns = c.createBufferSource()
  ns.buffer = noise(c, 128)
  const nf = c.createBiquadFilter()
  nf.type = 'highpass'; nf.frequency.value = 3000
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.015, now)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.015)
  ns.connect(nf).connect(ng).connect(c.destination)
  ns.start(now); ns.stop(now + 0.02)
}

// ── Drag / Swipe ──
// Smooth swoosh, pitch based on direction
export function playDragSound(direction: 'left' | 'right' = 'right') {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  const startFreq = direction === 'right' ? 300 : 500
  const endFreq = direction === 'right' ? 600 : 200

  const ns = c.createBufferSource()
  ns.buffer = noise(c, 2048)
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(startFreq, now)
  f.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12)
  f.Q.value = 2
  const g = c.createGain()
  g.gain.setValueAtTime(0.035, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
  ns.connect(f).connect(g).connect(c.destination)
  ns.start(now); ns.stop(now + 0.16)
}

// ── Vague / Uncertain ──
// Neutral mid-tone blip
export function playVagueSound() {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(380, now)
  o.frequency.exponentialRampToValueAtTime(340, now + 0.08)
  g.gain.setValueAtTime(0.025, now)
  g.gain.setTargetAtTime(0.0001, now + 0.03, 0.06)
  o.connect(g).connect(c.destination)
  o.start(now); o.stop(now + 0.3)
}

// ── Level Complete / All Done ──
// Celebratory ascending arpeggio
export function playCompleteSound() {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  const notes = [523.25, 659.25, 783.99, 1046.50] // C5-E5-G5-C6
  notes.forEach((freq, i) => {
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(freq, now + i * 0.08)
    g.gain.setValueAtTime(0.0001, now + i * 0.08)
    g.gain.exponentialRampToValueAtTime(0.04, now + i * 0.08 + 0.01)
    g.gain.setTargetAtTime(0.0001, now + i * 0.08 + 0.05, 0.2)

    // Add a harmonic for richness
    const o2 = c.createOscillator()
    o2.type = 'sine'
    o2.frequency.setValueAtTime(freq * 2, now + i * 0.08)
    const g2 = c.createGain()
    g2.gain.setValueAtTime(0.015, now + i * 0.08)
    g2.gain.setTargetAtTime(0.0001, now + i * 0.08 + 0.03, 0.15)

    o.connect(g).connect(c.destination)
    o2.connect(g2).connect(c.destination)
    o.start(now + i * 0.08); o.stop(now + i * 0.08 + 0.8)
    o2.start(now + i * 0.08); o2.stop(now + i * 0.08 + 0.6)
  })
}

// ── Combo / Streak ──
// Quick rising ping (for consecutive correct answers)
export function playComboSound(streak: number) {
  if (!isGameSfxEnabled()) return
  const c = getCtx(); if (!c) return
  const now = c.currentTime

  // Pitch rises with streak count
  const baseFreq = 600 + Math.min(streak, 10) * 60
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(baseFreq, now)
  o.frequency.exponentialRampToValueAtTime(baseFreq * 1.2, now + 0.06)
  g.gain.setValueAtTime(0.03, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
  o.connect(g).connect(c.destination)
  o.start(now); o.stop(now + 0.15)
}

export { GAME_SFX_KEY }
