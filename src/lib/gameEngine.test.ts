import { describe, it, expect, beforeEach } from 'vitest'
import { clearLocalStorage } from '../test/setup'
import {
  calcCorrectScore,
  calcWrongPenalty,
  calcTimeBonus,
  shuffleArray,
  generatePairs,
  saveGameRecord,
  getHighScore,
  getRecentRecords,
  FALLBACK_WORDS,
} from './gameEngine'

describe('gameEngine', () => {
  describe('calcCorrectScore', () => {
    it('combo 0 → base score 100', () => {
      expect(calcCorrectScore(0)).toBe(100)
    })

    it('combo 1 → 100 + 10 = 110', () => {
      expect(calcCorrectScore(1)).toBe(110)
    })

    it('combo 3 → 100 + 30 = 130', () => {
      expect(calcCorrectScore(3)).toBe(130)
    })

    it('combo 5 → 100 + 50 = 150', () => {
      expect(calcCorrectScore(5)).toBe(150)
    })

    it('combo capped at 10 → 100 + 100 = 200', () => {
      expect(calcCorrectScore(10)).toBe(200)
      expect(calcCorrectScore(15)).toBe(200)
    })
  })

  describe('calcWrongPenalty', () => {
    it('returns -20', () => {
      expect(calcWrongPenalty()).toBe(-20)
    })
  })

  describe('calcTimeBonus', () => {
    it('no time saved → 0', () => {
      expect(calcTimeBonus(60, 60)).toBe(0)
    })

    it('used more time than total → 0', () => {
      expect(calcTimeBonus(60, 90)).toBe(0)
    })

    it('saved 10s → 50 bonus', () => {
      expect(calcTimeBonus(60, 50)).toBe(50)
    })

    it('saved 30s → 150 bonus', () => {
      expect(calcTimeBonus(60, 30)).toBe(150)
    })
  })

  describe('shuffleArray', () => {
    it('returns a new array (does not mutate original)', () => {
      const original = [1, 2, 3, 4, 5]
      const shuffled = shuffleArray(original)
      expect(original).toEqual([1, 2, 3, 4, 5])
      expect(shuffled).toHaveLength(5)
    })

    it('contains all original elements', () => {
      const original = [1, 2, 3, 4, 5]
      const shuffled = shuffleArray(original)
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5])
    })

    it('empty array → empty array', () => {
      expect(shuffleArray([])).toEqual([])
    })
  })

  describe('generatePairs', () => {
    it('returns at most count pairs', () => {
      const pairs = generatePairs(FALLBACK_WORDS, 5)
      expect(pairs.length).toBe(5)
    })

    it('defaults to 8 pairs', () => {
      const pairs = generatePairs(FALLBACK_WORDS)
      expect(pairs.length).toBe(8)
    })

    it('returns all available if words < count', () => {
      const small = FALLBACK_WORDS.slice(0, 3)
      const pairs = generatePairs(small, 8)
      expect(pairs.length).toBe(3)
    })

    it('empty words → empty result', () => {
      expect(generatePairs([], 8)).toEqual([])
    })

    it('each pair has english and chinese', () => {
      const pairs = generatePairs(FALLBACK_WORDS, 3)
      pairs.forEach(p => {
        expect(p.english).toBeTruthy()
        expect(p.chinese).toBeTruthy()
      })
    })
  })

  describe('FALLBACK_WORDS', () => {
    it('has 20 fallback words', () => {
      expect(FALLBACK_WORDS).toHaveLength(20)
    })

    it('each word has english, chinese, and phonetic', () => {
      FALLBACK_WORDS.forEach(w => {
        expect(w.english).toBeTruthy()
        expect(w.chinese).toBeTruthy()
        expect(w.phonetic).toBeTruthy()
      })
    })
  })

  describe('localStorage persistence', () => {
    beforeEach(() => {
      clearLocalStorage()
    })

    it('getHighScore returns 0 when no records', () => {
      expect(getHighScore('word-match')).toBe(0)
    })

    it('saveGameRecord + getHighScore', () => {
      saveGameRecord({
        gameType: 'word-match',
        score: 500,
        date: '2026-03-30',
        maxCombo: 3,
        correctCount: 8,
        totalCount: 10,
      })
      saveGameRecord({
        gameType: 'word-match',
        score: 800,
        date: '2026-03-30',
        maxCombo: 5,
        correctCount: 10,
        totalCount: 10,
      })
      expect(getHighScore('word-match')).toBe(800)
    })

    it('getHighScore filters by gameType', () => {
      saveGameRecord({
        gameType: 'spelling',
        score: 999,
        date: '2026-03-30',
        maxCombo: 10,
        correctCount: 10,
        totalCount: 10,
      })
      expect(getHighScore('word-match')).toBe(0)
      expect(getHighScore('spelling')).toBe(999)
    })

    it('getRecentRecords returns empty when no records', () => {
      expect(getRecentRecords('word-match')).toEqual([])
    })

    it('getRecentRecords returns most recent first', () => {
      saveGameRecord({
        gameType: 'word-match',
        score: 100,
        date: '2026-03-28',
        maxCombo: 1,
        correctCount: 5,
        totalCount: 10,
      })
      saveGameRecord({
        gameType: 'word-match',
        score: 200,
        date: '2026-03-29',
        maxCombo: 2,
        correctCount: 7,
        totalCount: 10,
      })
      const records = getRecentRecords('word-match')
      expect(records[0].score).toBe(200)
      expect(records[1].score).toBe(100)
    })

    it('limits to 50 records', () => {
      for (let i = 0; i < 60; i++) {
        saveGameRecord({
          gameType: 'test',
          score: i,
          date: '2026-03-30',
          maxCombo: 0,
          correctCount: 0,
          totalCount: 0,
        })
      }
      const raw = JSON.parse(localStorage.getItem('linswift_game_records') || '[]')
      expect(raw.length).toBe(50)
    })
  })
})
