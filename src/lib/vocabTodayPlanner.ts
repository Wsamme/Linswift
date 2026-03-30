import { normalizeDailyGoal } from './learnSettings'
import { supabase, type UserVocabSet, type UserVocabSetWord } from './supabase'
import { getVocabSetLearnSettings } from './vocabSetLearnSettings'
import { getTomorrowStart } from './vocabStudyQueue'

export interface StudyQueueRowShape {
  id: number
  created_at: string
  review_count?: number | null
  next_review_at?: string | null
}

export interface ResolvedVocabSetPlan {
  id: number
  name: string
  createdAt: string
  dailyGoal: number
}

export interface AggregatedBucketSummary {
  key: string
  label: string
  dailyGoal: number
  selectedCount: number
  totalCandidateCount: number
}

export interface AggregatedTodayStudyQueueResult<T extends StudyQueueRowShape> {
  dueReviewRows: T[]
  newRows: T[]
  queue: T[]
  bucketSummaries: AggregatedBucketSummary[]
}

export interface UserVocabPlanningContext {
  setPlans: ResolvedVocabSetPlan[]
  memberships: UserVocabSetWord[]
}

function toTimestamp(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

function splitDueAndNewRows<T extends StudyQueueRowShape>(rows: T[]) {
  const tomorrowStart = getTomorrowStart()
  const dueReviewRows: T[] = []
  const newRows: T[] = []

  rows.forEach((item) => {
    const reviewCount = Number(item.review_count || 0)
    if (reviewCount <= 0) {
      newRows.push(item)
      return
    }

    if (!item.next_review_at || new Date(item.next_review_at) < tomorrowStart) {
      dueReviewRows.push(item)
    }
  })

  dueReviewRows.sort((left, right) => {
    const leftNext = left.next_review_at ? new Date(left.next_review_at).getTime() : Number.NEGATIVE_INFINITY
    const rightNext = right.next_review_at ? new Date(right.next_review_at).getTime() : Number.NEGATIVE_INFINITY
    if (leftNext !== rightNext) return leftNext - rightNext
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })

  newRows.sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())

  return { dueReviewRows, newRows }
}

export function resolveUserVocabSetPlans(
  userId: string | null | undefined,
  setRows: Array<Partial<UserVocabSet> & { id: number }>,
  fallbackDailyGoal: number
): ResolvedVocabSetPlan[] {
  return [...setRows]
    .map((row) => ({
      id: Number(row.id),
      name: row.name || '未命名学习集',
      createdAt: row.created_at || new Date(0).toISOString(),
      dailyGoal: getVocabSetLearnSettings(
        userId,
        row.id,
        fallbackDailyGoal,
        { dailyGoal: Number(row.daily_new_goal) > 0 ? Number(row.daily_new_goal) : undefined }
      ).dailyGoal,
    }))
    .sort((left, right) => {
      const createdDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      if (createdDiff !== 0) return createdDiff
      return left.id - right.id
    })
}

export async function fetchUserVocabPlanningContext(
  userId: string,
  fallbackDailyGoal: number
): Promise<UserVocabPlanningContext> {
  const [setsRes, membershipsRes] = await Promise.all([
    supabase
      .from('user_vocab_sets')
      .select('*')
      .eq('user_id', userId),
    supabase
      .from('user_vocab_set_words')
      .select('id,set_id,user_id,vocabulary_id,created_at')
      .eq('user_id', userId),
  ])

  if (setsRes.error || membershipsRes.error) {
    throw new Error(setsRes.error?.message || membershipsRes.error?.message || '学习计划上下文加载失败')
  }

  return {
    setPlans: resolveUserVocabSetPlans(userId, (setsRes.data || []) as UserVocabSet[], fallbackDailyGoal),
    memberships: (membershipsRes.data || []) as UserVocabSetWord[],
  }
}

export function buildAggregatedTodayStudyQueue<T extends StudyQueueRowShape>(
  rows: T[],
  options: {
    inboxDailyGoal: number
    setPlans?: ResolvedVocabSetPlan[]
    memberships?: Array<Pick<UserVocabSetWord, 'set_id' | 'vocabulary_id' | 'created_at'>>
    inboxLabel?: string
  }
): AggregatedTodayStudyQueueResult<T> {
  const { dueReviewRows, newRows } = splitDueAndNewRows(rows)
  const setPlans = options.setPlans || []
  const memberships = options.memberships || []
  const normalizedInboxDailyGoal = normalizeDailyGoal(options.inboxDailyGoal)
  const inboxLabel = options.inboxLabel || '收纳箱'

  const membershipsByVocabId = new Map<number, Array<Pick<UserVocabSetWord, 'set_id' | 'vocabulary_id' | 'created_at'>>>()
  memberships.forEach((membership) => {
    const vocabularyId = Number(membership.vocabulary_id)
    const next = membershipsByVocabId.get(vocabularyId) || []
    next.push(membership)
    membershipsByVocabId.set(vocabularyId, next)
  })
  membershipsByVocabId.forEach((list) => {
    list.sort((left, right) => toTimestamp(left.created_at) - toTimestamp(right.created_at))
  })

  const setPlanMap = new Map(setPlans.map((plan) => [plan.id, plan]))
  const bucketRows = new Map<number, T[]>()
  setPlans.forEach((plan) => bucketRows.set(plan.id, []))
  const inboxRows: T[] = []

  newRows.forEach((row) => {
    const membershipsForWord = membershipsByVocabId.get(Number(row.id)) || []
    const validSetIds = membershipsForWord
      .map((membership) => Number(membership.set_id))
      .filter((setId) => setPlanMap.has(setId))

    if (validSetIds.length === 0) {
      inboxRows.push(row)
      return
    }

    validSetIds.forEach((setId) => {
      const next = bucketRows.get(setId) || []
      next.push(row)
      bucketRows.set(setId, next)
    })
  })

  const selectedIds = new Set<number>()
  const selectedNewRows: T[] = []
  const bucketSummaries: AggregatedBucketSummary[] = []

  if (inboxRows.length > 0 || normalizedInboxDailyGoal > 0) {
    let picked = 0
    inboxRows.forEach((row) => {
      if (picked >= normalizedInboxDailyGoal || selectedIds.has(row.id)) return
      selectedIds.add(row.id)
      selectedNewRows.push(row)
      picked += 1
    })
    bucketSummaries.push({
      key: 'inbox',
      label: inboxLabel,
      dailyGoal: normalizedInboxDailyGoal,
      selectedCount: picked,
      totalCandidateCount: inboxRows.length,
    })
  }

  setPlans.forEach((plan) => {
    const candidates = bucketRows.get(plan.id) || []
    let picked = 0
    candidates.forEach((row) => {
      if (picked >= plan.dailyGoal || selectedIds.has(row.id)) return
      selectedIds.add(row.id)
      selectedNewRows.push(row)
      picked += 1
    })
    bucketSummaries.push({
      key: `set:${plan.id}`,
      label: plan.name,
      dailyGoal: plan.dailyGoal,
      selectedCount: picked,
      totalCandidateCount: candidates.length,
    })
  })

  return {
    dueReviewRows,
    newRows: selectedNewRows,
    queue: [...dueReviewRows, ...selectedNewRows],
    bucketSummaries,
  }
}
