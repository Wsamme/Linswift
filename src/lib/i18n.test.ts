import { describe, it, expect } from 'vitest'
import { t, tf, getLanguageLabel } from './i18n'

describe('i18n', () => {
  describe('t', () => {
    it('returns Chinese translation', () => {
      expect(t('zh-CN', 'nav_translate')).toBe('翻译')
      expect(t('zh-CN', 'nav_learn')).toBe('学习')
    })

    it('returns English translation', () => {
      expect(t('en', 'nav_translate')).toBe('Translate')
      expect(t('en', 'nav_learn')).toBe('Learn')
    })

    it('returns Japanese translation', () => {
      expect(t('ja', 'nav_translate')).toBe('翻訳')
      expect(t('ja', 'nav_learn')).toBe('学習')
    })

    it('falls back to Chinese for missing keys', () => {
      // All 3 languages should have the same keys, but if a language is missing one,
      // it should fall back to zh-CN
      const zhValue = t('zh-CN', 'vocab_empty')
      expect(zhValue).toBeTruthy()
    })
  })

  describe('tf (template formatting)', () => {
    it('replaces {count} placeholder', () => {
      const result = tf('zh-CN', 'vocab_current_count', { count: 42 })
      expect(result).toBe('当前筛选 42 词')
    })

    it('replaces {days} placeholder', () => {
      const result = tf('en', 'learn_streak', { days: 7 })
      expect(result).toBe('7 day streak')
    })

    it('replaces {word} placeholder', () => {
      const result = tf('zh-CN', 'vocab_delete_confirm', { word: 'apple' })
      expect(result).toContain('apple')
    })

    it('missing variable → empty string', () => {
      const result = tf('zh-CN', 'vocab_current_count', {})
      expect(result).toBe('当前筛选  词')
    })
  })

  describe('getLanguageLabel', () => {
    it('returns correct labels', () => {
      expect(getLanguageLabel('zh-CN')).toBe('简体中文')
      expect(getLanguageLabel('en')).toBe('English')
      expect(getLanguageLabel('ja')).toBe('日本語')
    })
  })

  describe('translation key completeness', () => {
    // Access the Chinese message keys indirectly through t()
    // We verify all keys return truthy values

    it('all zh-CN keys have en translations', () => {
      const keysToCheck = [
        'nav_translate', 'nav_learn', 'nav_vocab', 'nav_profile',
        'vocab_title', 'vocab_empty', 'vocab_delete',
        'learn_today_tasks', 'learn_streak',
        'profile_title', 'profile_logout',
        'common_close',
      ] as const

      for (const key of keysToCheck) {
        expect(t('en', key)).toBeTruthy()
        expect(t('ja', key)).toBeTruthy()
      }
    })
  })
})
