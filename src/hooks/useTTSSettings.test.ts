import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clearLocalStorage } from '../test/setup'

// Mock the tts module with controllable implementations
vi.mock('../lib/tts', () => ({
  DEFAULT_TTS_SETTINGS: {
    accent: 'en-US',
    rate: 1.0,
    volume: 0.8,
    autoPlay: false,
    wordPronounce: true,
    sentencePronounce: false,
    loopPlay: false,
  },
  loadTTSSettings: vi.fn().mockReturnValue({
    accent: 'en-US',
    rate: 1.0,
    volume: 0.8,
    autoPlay: false,
    wordPronounce: true,
    sentencePronounce: false,
    loopPlay: false,
  }),
  saveTTSSettings: vi.fn().mockImplementation((partial: any) => ({
    accent: 'en-US', rate: 1.0, volume: 0.8,
    autoPlay: false, wordPronounce: true, sentencePronounce: false, loopPlay: false,
    ...partial,
  })),
  findPreferredVoiceByLang: vi.fn().mockReturnValue(null),
  speakEnglish: vi.fn(),
  stopSpeaking: vi.fn(),
  waitForVoices: vi.fn().mockResolvedValue([]),
}))

import { useTTSSettings } from './useTTSSettings'
import { renderHook } from '@testing-library/react'

describe('useTTSSettings', () => {
  beforeEach(() => {
    clearLocalStorage()
    vi.clearAllMocks()
  })

  it('initializes with default TTS settings', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(result.current.settings.accent).toBe('en-US')
    expect(result.current.settings.rate).toBe(1.0)
    expect(result.current.settings.volume).toBe(0.8)
  })

  it('provides updateSettings function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.updateSettings).toBe('function')
  })

  it('provides setAccent function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.setAccent).toBe('function')
  })

  it('provides setRate function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.setRate).toBe('function')
  })

  it('provides setVolume function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.setVolume).toBe('function')
  })

  it('provides resetSettings function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.resetSettings).toBe('function')
  })

  it('provides stop function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.stop).toBe('function')
  })

  it('provides previewVoice function', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(typeof result.current.previewVoice).toBe('function')
  })

  it('voices starts as empty array', () => {
    const { result } = renderHook(() => useTTSSettings())
    expect(result.current.voices).toEqual([])
  })
})
