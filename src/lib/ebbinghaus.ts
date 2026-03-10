/**
 * 艾宾浩斯遗忘曲线算法
 *
 * 核心逻辑：根据用户对单词的记忆情况，计算下次复习时间
 * 复习间隔（天）：0, 1, 2, 4, 7, 15, 30
 *
 * mastery_level: 0-5 对应不同的复习阶段
 * review_count: 已复习次数
 *
 * 回答 "会"   → mastery_level + 1，进入下一个间隔
 * 回答 "模糊" → mastery_level 不变，重复当前间隔
 * 回答 "不会" → mastery_level 归 0，重头开始
 */

// 艾宾浩斯复习间隔（天数）
const REVIEW_INTERVALS = [0, 1, 2, 4, 7, 15, 30]

/**
 * 计算下次复习时间
 * @param currentMastery 当前熟练度 (0-5)
 * @param result 本次回答结果
 * @returns { nextReviewAt, newMastery, intervalDays }
 */
export function calculateNextReview(
  currentMastery: number,
  result: 'known' | 'fuzzy' | 'unknown'
): {
  nextReviewAt: string  // ISO 格式日期
  newMastery: number
  intervalDays: number
} {
  let newMastery: number

  switch (result) {
    case 'known':
      // 答对 → 进入下一个复习阶段
      newMastery = Math.min(currentMastery + 1, 5)
      break
    case 'fuzzy':
      // 模糊 → 保持当前阶段
      newMastery = currentMastery
      break
    case 'unknown':
      // 不会 → 重头开始
      newMastery = 0
      break
  }

  // 根据新的熟练度获取间隔天数
  const intervalDays = REVIEW_INTERVALS[Math.min(newMastery, REVIEW_INTERVALS.length - 1)]

  // 计算下次复习日期
  const now = new Date()
  now.setDate(now.getDate() + intervalDays)
  const nextReviewAt = now.toISOString()

  return { nextReviewAt, newMastery, intervalDays }
}

/**
 * 获取今日需要复习的词汇（next_review_at <= 今天）
 */
export function isReviewDue(nextReviewAt: string | null): boolean {
  if (!nextReviewAt) return true // 从未复习过，需要复习
  const reviewDate = new Date(nextReviewAt)
  const now = new Date()
  return reviewDate <= now
}

/**
 * 获取未来 7 天的复习计划
 * @param vocabulary 用户词汇列表
 * @returns 每天需要复习的词汇数量 [day0, day1, ..., day6]
 */
export function getWeeklyPlan(
  vocabulary: Array<{ next_review_at: string | null; mastery_level: number }>
): number[] {
  const plan = [0, 0, 0, 0, 0, 0, 0]
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  vocabulary.forEach(v => {
    if (!v.next_review_at) {
      // 从未复习过的 → 今天
      plan[0]++
      return
    }

    const reviewDate = new Date(v.next_review_at)
    reviewDate.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((reviewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      // 已过期 → 今天
      plan[0]++
    } else if (diffDays < 7) {
      plan[diffDays]++
    }
  })

  return plan
}

/**
 * 获取复习间隔描述
 */
export function getIntervalLabel(mastery: number): string {
  const labels = ['新词', '1天后', '2天后', '4天后', '7天后', '15天后', '已掌握']
  return labels[Math.min(mastery, labels.length - 1)]
}
