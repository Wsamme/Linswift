import { describe, it, expect, beforeEach } from 'vitest'
import { clearLocalStorage } from '../test/setup'
import {
  loadTTSSettings,
  saveTTSSettings,
  DEFAULT_TTS_SETTINGS,
  isTTSSupported,
  ACCENT_LABELS,
  SPEED_OPTIONS,
} from './tts'

const TTS_STORAGE_KEY = 'linswift_tts_settings'

describe('tts', () => {
  beforeEach(() => {
    clearLocalStorage()
  })

  describe('DEFAULT_TTS_SETTINGS', () => {
    it('has expected defaults', () => {
      expect(DEFAULT_TTS_SETTINGS.accent).toBe('en-US')
      expect(DEFAULT_TTS_SETTINGS.rate).toBe(1.0)
      expect(DEFAULT_TTS_SETTINGS.volume).toBe(0.8)
      expect(DEFAULT_TTS_SETTINGS.autoPlay).toBe(true)
      expect(DEFAULT_TTS_SETTINGS.wordPronounce).toBe(true)
      expect(DEFAULT_TTS_SETTINGS.sentencePronounce).toBe(false)
      expect(DEFAULT_TTS_SETTINGS.loopPlay).toBe(false)
    })
  })

  describe('loadTTSSettings', () => {
    it('returns defaults when nothing saved', () => {
      const settings = loadTTSSettings()
      expect(settings).toEqual(DEFAULT_TTS_SETTINGS)
    })

    it('reads saved settings', () => {
      localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({ accent: 'en-GB', rate: 1.5 }))
      const settings = loadTTSSettings()
      expect(settings.accent).toBe('en-GB')
      expect(settings.rate).toBe(1.5)
    })

    it('normalizes invalid accent to default', () => {
      localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({ accent: 'fr-FR' }))
      expect(loadTTSSettings().accent).toBe('en-US')
    })

    it('clamps rate to 0.5-2.0', () => {
      localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({ rate: 5.0 }))
      expect(loadTTSSettings().rate).toBe(2.0)

      localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({ rate: 0.1 }))
      expect(loadTTSSettings().rate).toBe(0.5)
    })

    it('resets volume=0 to default (prevents silent mode)', () => {
      localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({ volume: 0 }))
      expect(loadTTSSettings().volume).toBe(DEFAULT_TTS_SETTINGS.volume)
    })

    it('clamps volume to 0-1', () => {
      localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify({ volume: 2.0 }))
      expect(loadTTSSettings().volume).toBe(1.0)
    })

    it('handles corrupted JSON gracefully', () => {
      localStorage.setItem(TTS_STORAGE_KEY, 'not-json')
      expect(loadTTSSettings()).toEqual(DEFAULT_TTS_SETTINGS)
    })
  })

  describe('saveTTSSettings', () => {
    it('merges partial settings with current', () => {
      saveTTSSettings({ accent: 'en-AU' })
      const settings = loadTTSSettings()
      expect(settings.accent).toBe('en-AU')
      expect(settings.rate).toBe(DEFAULT_TTS_SETTINGS.rate)
    })

    it('returns the normalized merged settings', () => {
      const result = saveTTSSettings({ rate: 10 })
      expect(result.rate).toBe(2.0)
    })
  })

  describe('ACCENT_LABELS', () => {
    it('has labels for all 3 accents', () => {
      expect(ACCENT_LABELS['en-US']).toBeTruthy()
      expect(ACCENT_LABELS['en-GB']).toBeTruthy()
      expect(ACCENT_LABELS['en-AU']).toBeTruthy()
    })
  })

  describe('SPEED_OPTIONS', () => {
    it('has 6 speed options', () => {
      expect(SPEED_OPTIONS).toHaveLength(6)
    })

    it('each has label and value', () => {
      SPEED_OPTIONS.forEach(opt => {
        expect(opt.label).toBeTruthy()
        expect(typeof opt.value).toBe('number')
      })
    })
  })

  describe('isTTSSupported', () => {
    it('returns boolean', () => {
      expect(typeof isTTSSupported()).toBe('boolean')
    })
  })
})
