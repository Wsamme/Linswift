/**
 * gameEngine.ts — 词汇游戏通用引擎
 *
 * 提供所有词汇游戏共用的核心逻辑：
 *   - 游戏状态管理
 *   - 得分计算系统（基础分 + 连击奖励 + 时间奖励）
 *   - 数组洗牌、配对生成等工具函数
 *   - localStorage 分数持久化
 */

// ========== 游戏状态类型 ==========

/** 游戏的生命周期状态 */
export type GameStatus = 'idle' | 'playing' | 'paused' | 'finished'

/** 单个词汇配对（英文 ↔ 中文） */
export interface WordPair {
  /** 词汇表 ID（可选，用于关联数据库） */
  id?: number
  /** 英文单词 */
  english: string
  /** 中文释义 */
  chinese: string
  /** 音标（可选，拼写游戏用） */
  phonetic?: string
}

// ========== 得分系统 ==========

/** 得分系统配置 */
const SCORE_CONFIG = {
  /** 每次正确答对的基础分 */
  BASE_CORRECT: 100,
  /** 答错时扣分 */
  PENALTY_WRONG: -20,
  /** 连击奖励：每连续正确一次，额外加的分 */
  COMBO_BONUS: 10,
  /** 连击上限 */
  COMBO_MAX: 10,
  /** 时间奖励：每提前一秒完成额外加的分 */
  TIME_BONUS_PER_SECOND: 5,
}

/**
 * 计算一次正确答对的得分
 * @param combo - 当前连击数（连续正确次数）
 * @returns 本次得分（基础分 + 连击奖励）
 */
export function calcCorrectScore(combo: number): number {
  const comboBonus = Math.min(combo, SCORE_CONFIG.COMBO_MAX) * SCORE_CONFIG.COMBO_BONUS
  return SCORE_CONFIG.BASE_CORRECT + comboBonus
}

/**
 * 答错时的扣分
 */
export function calcWrongPenalty(): number {
  return SCORE_CONFIG.PENALTY_WRONG
}

/**
 * 计算时间奖励
 * @param totalSeconds  - 游戏总时长（秒）
 * @param usedSeconds   - 实际用时（秒）
 * @returns 时间奖励分数（>=0）
 */
export function calcTimeBonus(totalSeconds: number, usedSeconds: number): number {
  const saved = Math.max(0, totalSeconds - usedSeconds)
  return saved * SCORE_CONFIG.TIME_BONUS_PER_SECOND
}

// ========== 工具函数 ==========

/**
 * Fisher-Yates 洗牌算法 —— 随机打乱数组
 * 返回新数组，不修改原数组
 */
export function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * 从词汇列表中随机选取 n 对，并生成配对卡片数据
 * @param words  - 原始词汇数组
 * @param count  - 需要的配对数量（默认 8）
 * @returns 随机选取并打乱的 WordPair 数组
 */
export function generatePairs(words: WordPair[], count: number = 8): WordPair[] {
  // 如果词汇不够，有多少取多少
  const available = shuffleArray(words)
  return available.slice(0, Math.min(count, available.length))
}

// ========== 分数持久化 ==========

/** 本地保存的游戏记录 */
interface GameRecord {
  /** 游戏类型 */
  gameType: string
  /** 分数 */
  score: number
  /** 日期 */
  date: string
  /** 连击最高 */
  maxCombo: number
  /** 正确数 */
  correctCount: number
  /** 总题数 */
  totalCount: number
}

const GAME_RECORDS_KEY = 'linswift_game_records'

/**
 * 保存游戏记录到 localStorage
 */
export function saveGameRecord(record: GameRecord): void {
  try {
    const raw = localStorage.getItem(GAME_RECORDS_KEY)
    const records: GameRecord[] = raw ? JSON.parse(raw) : []
    records.unshift(record) // 最新的放前面
    // 只保留最近 50 条
    localStorage.setItem(GAME_RECORDS_KEY, JSON.stringify(records.slice(0, 50)))
  } catch {
    // localStorage 不可用时静默失败
  }
}

/**
 * 读取某游戏类型的最高分
 */
export function getHighScore(gameType: string): number {
  try {
    const raw = localStorage.getItem(GAME_RECORDS_KEY)
    if (!raw) return 0
    const records: GameRecord[] = JSON.parse(raw)
    const filtered = records.filter(r => r.gameType === gameType)
    return filtered.reduce((max, r) => Math.max(max, r.score), 0)
  } catch {
    return 0
  }
}

/**
 * 读取某游戏类型的最近记录
 */
export function getRecentRecords(gameType: string, limit: number = 5): GameRecord[] {
  try {
    const raw = localStorage.getItem(GAME_RECORDS_KEY)
    if (!raw) return []
    const records: GameRecord[] = JSON.parse(raw)
    return records.filter(r => r.gameType === gameType).slice(0, limit)
  } catch {
    return []
  }
}

// ========== 内置示例词库（当用户词库为空时使用） ==========

export const FALLBACK_WORDS: WordPair[] = [
  { english: 'apple', chinese: '苹果', phonetic: '/ˈæp.l/' },
  { english: 'banana', chinese: '香蕉', phonetic: '/bəˈnæn.ə/' },
  { english: 'cat', chinese: '猫', phonetic: '/kæt/' },
  { english: 'dog', chinese: '狗', phonetic: '/dɑːɡ/' },
  { english: 'elephant', chinese: '大象', phonetic: '/ˈel.ə.fənt/' },
  { english: 'flower', chinese: '花', phonetic: '/flaʊ.ər/' },
  { english: 'guitar', chinese: '吉他', phonetic: '/ɡɪˈtɑːr/' },
  { english: 'hospital', chinese: '医院', phonetic: '/ˈhɑː.spɪ.t̬əl/' },
  { english: 'island', chinese: '岛屿', phonetic: '/ˈaɪ.lənd/' },
  { english: 'jungle', chinese: '丛林', phonetic: '/ˈdʒʌŋ.ɡl/' },
  { english: 'kitchen', chinese: '厨房', phonetic: '/ˈkɪtʃ.ən/' },
  { english: 'library', chinese: '图书馆', phonetic: '/ˈlaɪ.brer.i/' },
  { english: 'mountain', chinese: '山', phonetic: '/ˈmaʊn.tən/' },
  { english: 'notebook', chinese: '笔记本', phonetic: '/ˈnoʊt.bʊk/' },
  { english: 'ocean', chinese: '海洋', phonetic: '/ˈoʊ.ʃən/' },
  { english: 'pencil', chinese: '铅笔', phonetic: '/ˈpen.sl/' },
  { english: 'question', chinese: '问题', phonetic: '/ˈkwes.tʃən/' },
  { english: 'rainbow', chinese: '彩虹', phonetic: '/ˈreɪn.boʊ/' },
  { english: 'student', chinese: '学生', phonetic: '/ˈstuː.dənt/' },
  { english: 'teacher', chinese: '老师', phonetic: '/ˈtiː.tʃɚ/' },
]
