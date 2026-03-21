/**
 * 艾宾浩斯复习算法（支持 7/15 天复习制）
 */

export type ReviewCycleDays = 7 | 15
export const MASTERED_LEVEL = 5
export const DEFAULT_REVIEW_CYCLE_DAYS: ReviewCycleDays = 7

// 兼容旧导出名：默认按 7 天制展示
export const REVIEW_INTERVALS = [0, 1, 2, 4, 7] as const

const REVIEW_SCHEDULES: Record<ReviewCycleDays, readonly number[]> = {
  // 5 个阶段（0~4），再往上进入 mastered=5
  7: [0, 1, 2, 4, 7],
  15: [0, 1, 3, 7, 15],
}

export function normalizeReviewCycleDays(value: unknown): ReviewCycleDays {
  return Number(value) === 15 ? 15 : 7
}

export function getReviewIntervals(cycleDays: ReviewCycleDays = DEFAULT_REVIEW_CYCLE_DAYS): readonly number[] {
  return REVIEW_SCHEDULES[normalizeReviewCycleDays(cycleDays)]
}

export function getReviewProgressMaxLevel(cycleDays: ReviewCycleDays = DEFAULT_REVIEW_CYCLE_DAYS): number {
  return getReviewIntervals(cycleDays).length - 1
}

export function isMasteredLevel(level: number): boolean {
  return level >= MASTERED_LEVEL
}

export function getReviewCycleDaysFromLocalStorage(): ReviewCycleDays {
  try {
    const raw = localStorage.getItem('linswift_learn_settings')
    if (!raw) return DEFAULT_REVIEW_CYCLE_DAYS
    const parsed = JSON.parse(raw) as { reviewCycleDays?: number }
    return normalizeReviewCycleDays(parsed.reviewCycleDays)
  } catch {
    return DEFAULT_REVIEW_CYCLE_DAYS
  }
}

/**
 * 计算下次复习时间
 */
export function calculateNextReview(
  currentMastery: number,
  result: 'known' | 'fuzzy' | 'unknown',
  cycleDays: ReviewCycleDays = DEFAULT_REVIEW_CYCLE_DAYS
): {
  nextReviewAt: string | null
  newMastery: number
  intervalDays: number
} {
  const safeCycle = normalizeReviewCycleDays(cycleDays)
  const schedule = getReviewIntervals(safeCycle)
  const progressMax = getReviewProgressMaxLevel(safeCycle)
  const safeCurrent = Math.max(0, Math.min(MASTERED_LEVEL, currentMastery ?? 0))

  let newMastery = safeCurrent

  if (result === 'known') {
    if (safeCurrent >= progressMax) {
      // 完成当前复习制后，自动归入已掌握
      newMastery = MASTERED_LEVEL
    } else {
      newMastery = Math.min(safeCurrent + 1, progressMax)
    }
  } else if (result === 'fuzzy') {
    newMastery = safeCurrent
  } else {
    // unknown
    newMastery = 0
  }

  // 已掌握不再排下一次复习
  if (isMasteredLevel(newMastery)) {
    return {
      nextReviewAt: null,
      newMastery,
      intervalDays: schedule[progressMax] || 0,
    }
  }

  const intervalDays = schedule[Math.min(newMastery, progressMax)] || 0
  const now = new Date()
  now.setDate(now.getDate() + intervalDays)

  return {
    nextReviewAt: now.toISOString(),
    newMastery,
    intervalDays,
  }
}

export function isReviewDue(nextReviewAt: string | null): boolean {
  if (!nextReviewAt) return true
  const reviewDate = new Date(nextReviewAt)
  const now = new Date()
  return reviewDate <= now
}

export function getWeeklyPlan(
  vocabulary: Array<{ next_review_at: string | null; mastery_level: number }>
): number[] {
  return getEbbinghausForecastPlan(vocabulary, 7, DEFAULT_REVIEW_CYCLE_DAYS)
}

interface EbbinghausForecastWord {
  next_review_at: string | null
  mastery_level: number
}

function startOfTodayLocal() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function getDayOffset(nextReviewAt: string | null, today: Date): number {
  if (!nextReviewAt) return 0
  const target = new Date(nextReviewAt)
  target.setHours(0, 0, 0, 0)
  const diffMs = target.getTime() - today.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * 动态负载预测：按 known 路径推演未来 N 天复习量
 */
export function getEbbinghausForecastPlan(
  words: EbbinghausForecastWord[],
  horizonDays: number,
  cycleDays: ReviewCycleDays = DEFAULT_REVIEW_CYCLE_DAYS
): number[] {
  const safeCycle = normalizeReviewCycleDays(cycleDays)
  const horizon = Math.max(1, Math.floor(horizonDays))
  const buckets: number[][] = Array.from({ length: horizon }, () => [])
  const plan = Array.from({ length: horizon }, () => 0)
  const today = startOfTodayLocal()

  for (const word of words) {
    if (isMasteredLevel(word.mastery_level ?? 0)) continue
    const offset = getDayOffset(word.next_review_at, today)
    if (offset < 0) buckets[0].push(word.mastery_level ?? 0)
    else if (offset < horizon) buckets[offset].push(word.mastery_level ?? 0)
  }

  for (let day = 0; day < horizon; day += 1) {
    const dueToday = buckets[day]
    plan[day] = dueToday.length

    for (const mastery of dueToday) {
      const review = calculateNextReview(mastery, 'known', safeCycle)
      if (isMasteredLevel(review.newMastery) || review.intervalDays <= 0) continue
      const nextDay = day + review.intervalDays
      if (nextDay >= 0 && nextDay < horizon) {
        buckets[nextDay].push(review.newMastery)
      }
    }
  }

  return plan
}

export function getEbbinghausSevenDayForecast(
  words: EbbinghausForecastWord[],
  cycleDays: ReviewCycleDays = DEFAULT_REVIEW_CYCLE_DAYS
): number[] {
  return getEbbinghausForecastPlan(words, 7, cycleDays)
}

export function getIntervalLabel(mastery: number, cycleDays: ReviewCycleDays = DEFAULT_REVIEW_CYCLE_DAYS): string {
  if (isMasteredLevel(mastery)) return '已掌握'
  const schedule = getReviewIntervals(cycleDays)
  const safe = Math.max(0, Math.min(getReviewProgressMaxLevel(cycleDays), mastery))
  const day = schedule[safe] || 0
  if (safe === 0) return '新词'
  return `${day}天后`
}
