import rawWords from './30k.txt?raw'
import { PROPER_NOUN_BLACKLIST } from './properNouns'

export const VOCAB_LEVEL_COUNT = 10 as const
export const VOCAB_LEVEL_PASS_SCORE = 7 as const
export const VOCAB_WORDS_PER_LEVEL_TEST = 10 as const
export const PUBLIC_VOCAB_TOTAL_WORDS = 20000 as const
export const VOCAB_LEVEL_TARGETS = [500, 1000, 2000, 3500, 5000, 7000, 9500, 12500, 16000, 20000] as const

const WORD_REGEX = /^[a-z]+(?:['-][a-z]+)*$/
const HAS_VOWEL_REGEX = /[aeiouy]/
const SHORT_WORD_WHITELIST = new Set([
  'a', 'i',
  'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'of', 'on', 'or', 'ox', 'to', 'up', 'us', 'we',
])
const ABBREVIATION_BLACKLIST = new Set([
  'api', 'sdk', 'sql', 'html', 'css', 'js', 'json', 'xml', 'http', 'https',
  'tcp', 'udp', 'dns', 'ip', 'cpu', 'gpu', 'ram', 'ssd', 'usb',
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg', 'php', 'ios', 'ai',
  'mba', 'phd', 'ceo', 'cfo', 'cto', 'hr',
])

function isValidCandidate(word: string): boolean {
  if (!WORD_REGEX.test(word)) return false
  if (word.length < 2 || word.length > 24) return false
  if (!HAS_VOWEL_REGEX.test(word)) return false
  if (word.length <= 2 && !SHORT_WORD_WHITELIST.has(word)) return false
  if (ABBREVIATION_BLACKLIST.has(word)) return false
  if (PROPER_NOUN_BLACKLIST.has(word)) return false
  return true
}

const cleanedWords = Array.from(
  new Set(
    rawWords
      .split('\n')
      .map((line) => line.split('\t')[0]?.trim().toLowerCase() || '')
      .filter((word) => Boolean(word) && isValidCandidate(word))
  )
)

export const PUBLIC_VOCAB_CANDIDATE_COUNT = cleanedWords.length
const publicCoreWords = cleanedWords.slice(0, PUBLIC_VOCAB_TOTAL_WORDS)

export const VOCAB_LEVELS: string[][] = Array.from({ length: VOCAB_LEVEL_COUNT }, (_, idx) => {
  const start = idx === 0 ? 0 : VOCAB_LEVEL_TARGETS[idx - 1]
  const end = VOCAB_LEVEL_TARGETS[idx]
  return publicCoreWords.slice(start, end)
})

export const VOCAB_LEVEL_SPANS = VOCAB_LEVEL_TARGETS.map((target, index) => {
  return target - (index === 0 ? 0 : VOCAB_LEVEL_TARGETS[index - 1])
})

export interface LevelAnswerStats {
  known: number
  unknown: number
  total: number
}

export function getLevelWordRange(levelIndex: number) {
  const safeLevelIndex = Math.max(0, Math.min(VOCAB_LEVEL_COUNT - 1, levelIndex))
  return {
    start: safeLevelIndex === 0 ? 1 : VOCAB_LEVEL_TARGETS[safeLevelIndex - 1] + 1,
    end: VOCAB_LEVEL_TARGETS[safeLevelIndex],
  }
}

export function estimateVocabularyByAnswerStats(answerStats: LevelAnswerStats[]) {
  let estimate = 0

  for (let index = 0; index < VOCAB_LEVEL_COUNT; index += 1) {
    const stats = answerStats[index]
    if (!stats || stats.total <= 0) break

    const previousTarget = index === 0 ? 0 : VOCAB_LEVEL_TARGETS[index - 1]
    const levelSpan = VOCAB_LEVEL_SPANS[index]
    const ratio = Math.max(0, Math.min(1, stats.known / Math.max(1, stats.total)))
    estimate = previousTarget + Math.round(levelSpan * ratio)

    const passed =
      stats.total >= VOCAB_WORDS_PER_LEVEL_TEST && stats.known >= VOCAB_LEVEL_PASS_SCORE
    if (passed) {
      estimate = VOCAB_LEVEL_TARGETS[index]
      continue
    }

    break
  }

  return Math.max(0, Math.min(PUBLIC_VOCAB_TOTAL_WORDS, estimate))
}

export function randomSampleWords(source: string[], count: number): string[] {
  const pool = [...source]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}
