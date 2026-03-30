import { normalizeDailyGoal } from './learnSettings'

export interface StudyQueueRowShape {
  id: number
  created_at: string
  review_count?: number | null
  next_review_at?: string | null
}

export function getTomorrowStart(date = new Date()) {
  const todayStart = new Date(date)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  return tomorrowStart
}

export function buildTodayStudyQueue<T extends StudyQueueRowShape>(rows: T[], dailyGoal: number) {
  const tomorrowStart = getTomorrowStart()
  const dueReviewRows: T[] = []
  const newRows: T[] = []

  rows.forEach((item) => {
    const reviewCount = Number(item.review_count || 0)
    if (reviewCount <= 0) {
      newRows.push(item)
      return
    }

    if (!item.next_review_at) {
      dueReviewRows.push(item)
      return
    }

    if (new Date(item.next_review_at) < tomorrowStart) {
      dueReviewRows.push(item)
    }
  })

  dueReviewRows.sort((left, right) => {
    const leftNext = left.next_review_at
      ? new Date(left.next_review_at).getTime()
      : Number.NEGATIVE_INFINITY
    const rightNext = right.next_review_at
      ? new Date(right.next_review_at).getTime()
      : Number.NEGATIVE_INFINITY

    if (leftNext !== rightNext) {
      return leftNext - rightNext
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })

  newRows.sort((left, right) => {
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })

  const safeDailyGoal = normalizeDailyGoal(dailyGoal)

  return {
    dueReviewRows,
    newRows,
    queue: [...dueReviewRows, ...newRows.slice(0, safeDailyGoal)],
  }
}
