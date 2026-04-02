import { describe, it, expect, vi } from 'vitest'
import {
  calculateNextReview,
  isReviewDue,
  getReviewIntervals,
  getReviewProgressMaxLevel,
  isMasteredLevel,
  normalizeReviewCycleDays,
  getIntervalLabel,
  getEbbinghausForecastPlan,
  MASTERED_LEVEL,
  REVIEW_INTERVALS,
} from './ebbinghaus'

vi.mock('./learnSettings', () => ({
  loadLearnSettings: () => ({ reviewCycleDays: 7 }),
}))

describe('ebbinghaus', () => {
  describe('normalizeReviewCycleDays', () => {
    it('returns 7 for default/invalid values', () => {
      expect(normalizeReviewCycleDays(undefined)).toBe(7)
      expect(normalizeReviewCycleDays(null)).toBe(7)
      expect(normalizeReviewCycleDays('abc')).toBe(7)
      expect(normalizeReviewCycleDays(10)).toBe(7)
    })

    it('returns 15 when given 15', () => {
      expect(normalizeReviewCycleDays(15)).toBe(15)
      expect(normalizeReviewCycleDays('15')).toBe(15)
    })
  })

  describe('getReviewIntervals', () => {
    it('returns 7-day schedule: [0, 1, 2, 4, 7]', () => {
      expect(getReviewIntervals(7)).toEqual([0, 1, 2, 4, 7])
    })

    it('returns 15-day schedule: [0, 1, 3, 7, 15]', () => {
      expect(getReviewIntervals(15)).toEqual([0, 1, 3, 7, 15])
    })

    it('REVIEW_INTERVALS matches 7-day schedule', () => {
      expect(REVIEW_INTERVALS).toEqual([0, 1, 2, 4, 7])
    })
  })

  describe('getReviewProgressMaxLevel', () => {
    it('returns 4 for 7-day cycle (5 stages: 0-4)', () => {
      expect(getReviewProgressMaxLevel(7)).toBe(4)
    })

    it('returns 4 for 15-day cycle', () => {
      expect(getReviewProgressMaxLevel(15)).toBe(4)
    })
  })

  describe('isMasteredLevel', () => {
    it('returns false for levels below MASTERED_LEVEL', () => {
      expect(isMasteredLevel(0)).toBe(false)
      expect(isMasteredLevel(4)).toBe(false)
    })

    it('returns true for MASTERED_LEVEL and above', () => {
      expect(isMasteredLevel(MASTERED_LEVEL)).toBe(true)
      expect(isMasteredLevel(6)).toBe(true)
    })
  })

  describe('calculateNextReview', () => {
    describe('result = known', () => {
      it('mastery 0 → 1, interval = 1 day', () => {
        const result = calculateNextReview(0, 'known', 7)
        expect(result.newMastery).toBe(1)
        expect(result.intervalDays).toBe(1)
        expect(result.nextReviewAt).not.toBeNull()
      })

      it('mastery 1 → 2, interval = 2 days', () => {
        const result = calculateNextReview(1, 'known', 7)
        expect(result.newMastery).toBe(2)
        expect(result.intervalDays).toBe(2)
      })

      it('mastery 2 → 3, interval = 4 days', () => {
        const result = calculateNextReview(2, 'known', 7)
        expect(result.newMastery).toBe(3)
        expect(result.intervalDays).toBe(4)
      })

      it('mastery 3 → 4, interval = 7 days', () => {
        const result = calculateNextReview(3, 'known', 7)
        expect(result.newMastery).toBe(4)
        expect(result.intervalDays).toBe(7)
      })

      it('mastery 4 (progressMax) → MASTERED, nextReviewAt = null', () => {
        const result = calculateNextReview(4, 'known', 7)
        expect(result.newMastery).toBe(MASTERED_LEVEL)
        expect(result.nextReviewAt).toBeNull()
      })

      it('already mastered → stays mastered', () => {
        const result = calculateNextReview(MASTERED_LEVEL, 'known', 7)
        expect(result.newMastery).toBe(MASTERED_LEVEL)
        expect(result.nextReviewAt).toBeNull()
      })
    })

    describe('result = fuzzy', () => {
      it('mastery stays the same', () => {
        const result = calculateNextReview(2, 'fuzzy', 7)
        expect(result.newMastery).toBe(2)
        expect(result.intervalDays).toBe(2)
        expect(result.nextReviewAt).not.toBeNull()
      })

      it('mastery 0 stays 0, interval = 0 days', () => {
        const result = calculateNextReview(0, 'fuzzy', 7)
        expect(result.newMastery).toBe(0)
        expect(result.intervalDays).toBe(0)
      })
    })

    describe('result = unknown', () => {
      it('mastery resets to 0', () => {
        const result = calculateNextReview(3, 'unknown', 7)
        expect(result.newMastery).toBe(0)
        expect(result.intervalDays).toBe(0)
      })

      it('mastery already 0 stays 0', () => {
        const result = calculateNextReview(0, 'unknown', 7)
        expect(result.newMastery).toBe(0)
      })
    })

    describe('15-day cycle', () => {
      it('mastery 0 → 1, interval = 1 day', () => {
        const result = calculateNextReview(0, 'known', 15)
        expect(result.newMastery).toBe(1)
        expect(result.intervalDays).toBe(1)
      })

      it('mastery 2 → 3, interval = 7 days (15-day schedule)', () => {
        const result = calculateNextReview(2, 'known', 15)
        expect(result.newMastery).toBe(3)
        expect(result.intervalDays).toBe(7)
      })
    })

    describe('edge cases', () => {
      it('null mastery treated as 0', () => {
        const result = calculateNextReview(null as unknown as number, 'known', 7)
        expect(result.newMastery).toBe(1)
      })

      it('negative mastery clamped to 0', () => {
        const result = calculateNextReview(-5, 'known', 7)
        expect(result.newMastery).toBe(1)
      })

      it('mastery > MASTERED clamped', () => {
        const result = calculateNextReview(10, 'known', 7)
        expect(result.newMastery).toBe(MASTERED_LEVEL)
        expect(result.nextReviewAt).toBeNull()
      })
    })
  })

  describe('isReviewDue', () => {
    it('null nextReviewAt → due (new word)', () => {
      expect(isReviewDue(null)).toBe(true)
    })

    it('past date → due', () => {
      const past = new Date()
      past.setDate(past.getDate() - 1)
      expect(isReviewDue(past.toISOString())).toBe(true)
    })

    it('future date → not due', () => {
      const future = new Date()
      future.setDate(future.getDate() + 1)
      expect(isReviewDue(future.toISOString())).toBe(false)
    })
  })

  describe('getIntervalLabel', () => {
    it('mastered → "已掌握"', () => {
      expect(getIntervalLabel(MASTERED_LEVEL)).toBe('已掌握')
    })

    it('mastery 0 → "新词"', () => {
      expect(getIntervalLabel(0)).toBe('新词')
    })

    it('mastery 1 → "1天后"', () => {
      expect(getIntervalLabel(1, 7)).toBe('1天后')
    })

    it('mastery 3 → "4天后" (7-day)', () => {
      expect(getIntervalLabel(3, 7)).toBe('4天后')
    })
  })

  describe('getEbbinghausForecastPlan', () => {
    it('returns array of length = horizonDays', () => {
      const plan = getEbbinghausForecastPlan([], 7)
      expect(plan).toHaveLength(7)
      expect(plan.every(n => n === 0)).toBe(true)
    })

    it('overdue words land in day 0', () => {
      const past = new Date()
      past.setDate(past.getDate() - 2)
      const words = [{ next_review_at: past.toISOString(), mastery_level: 1 }]
      const plan = getEbbinghausForecastPlan(words, 7)
      expect(plan[0]).toBeGreaterThanOrEqual(1)
    })

    it('mastered words are excluded', () => {
      const words = [{ next_review_at: null, mastery_level: MASTERED_LEVEL }]
      const plan = getEbbinghausForecastPlan(words, 7)
      expect(plan.every(n => n === 0)).toBe(true)
    })

    it('propagates future reviews via known path', () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const words = [{ next_review_at: today.toISOString(), mastery_level: 0 }]
      const plan = getEbbinghausForecastPlan(words, 7, 7)
      // day 0 has this word; after answering "known" it goes to mastery 1 → interval 1 → day 1
      expect(plan[0]).toBe(1)
      expect(plan[1]).toBeGreaterThanOrEqual(1)
    })
  })
})
