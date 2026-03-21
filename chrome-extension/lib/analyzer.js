const TOKEN_REGEX = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g
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
const DEFAULT_SETTINGS = {
  level: 'intermediate',
  maxResults: 18,
  inlineTranslateEnabled: false,
  autoTranslateOnLoad: true,
  translationLanguage: 'zh-CN',
  translationMode: 'hybrid',
  disabledAutoTranslateHosts: [],
  youtubeSubtitleMode: 'vocab',
  uiScale: 0.56,
}

function normalizeWord(rawWord) {
  let word = rawWord.toLowerCase().replace(/[’]/g, "'")
  if (word.endsWith("'s")) word = word.slice(0, -2)
  if (word.endsWith("s'")) word = word.slice(0, -1)
  return word
}

function isValidCandidate(word) {
  if (!WORD_REGEX.test(word)) return false
  if (word.length < 2 || word.length > 24) return false
  if (!HAS_VOWEL_REGEX.test(word)) return false
  if (word.length <= 2 && !SHORT_WORD_WHITELIST.has(word)) return false
  if (ABBREVIATION_BLACKLIST.has(word)) return false
  return true
}

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS }
}

export function getLevelProfile(level) {
  switch (level) {
    case 'beginner':
      return { label: '初级', knownRankThreshold: 1500 }
    case 'advanced':
      return { label: '高级', knownRankThreshold: 6000 }
    case 'intermediate':
    default:
      return { label: '中级', knownRankThreshold: 3000 }
  }
}

export function buildFrequencyData(rawText) {
  const words = rawText
    .split('\n')
    .map((line) => line.split('\t')[0]?.trim().toLowerCase() || '')
    .filter(Boolean)

  const uniqueWords = []
  const seen = new Set()

  words.forEach((word) => {
    if (!seen.has(word) && isValidCandidate(word)) {
      seen.add(word)
      uniqueWords.push(word)
    }
  })

  const rankMap = new Map()
  uniqueWords.forEach((word, index) => {
    rankMap.set(word, index + 1)
  })

  return {
    words: uniqueWords,
    rankMap,
    commonWords: new Set(uniqueWords.slice(0, 3000)),
  }
}

function buildSnippet(segmentText, word) {
  const lower = segmentText.toLowerCase()
  const index = lower.indexOf(word.toLowerCase())
  if (index < 0) return segmentText.trim().slice(0, 120)

  const start = Math.max(0, index - 42)
  const end = Math.min(segmentText.length, index + word.length + 54)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < segmentText.length ? '...' : ''
  return `${prefix}${segmentText.slice(start, end).trim()}${suffix}`
}

function difficultyLabel(rank) {
  if (!rank) return '罕见词'
  if (rank <= 3000) return '高频词'
  if (rank <= 6000) return '进阶词'
  if (rank <= 12000) return '较难词'
  return '低频词'
}

function scoreWord({ word, count, rank, threshold }) {
  const lengthScore = Math.min(1, Math.max(0, (word.length - 4) / 7))
  const frequencyScore = Math.min(1, count / 4)
  const rarityScore = rank
    ? Math.min(1, Math.max(0, (rank - threshold) / 9000))
    : 1

  return rarityScore * 0.55 + frequencyScore * 0.3 + lengthScore * 0.15
}

export function analyzePageText(pageData, frequencyData, rawSettings = {}, knownWords = []) {
  const settings = { ...DEFAULT_SETTINGS, ...rawSettings }
  const profile = getLevelProfile(settings.level)
  const knownWordSet = new Set(
    knownWords
      .map((word) => normalizeWord(word))
      .filter(Boolean)
  )
  const counts = new Map()
  const snippets = new Map()
  let totalTokens = 0

  ;(pageData.segments || []).forEach((segment) => {
    const text = String(segment.text || '')
    const matches = text.match(TOKEN_REGEX) || []
    totalTokens += matches.length

    matches.forEach((rawWord) => {
      const word = normalizeWord(rawWord)
      if (!isValidCandidate(word)) return
      if (knownWordSet.has(word)) return

      const current = counts.get(word) || 0
      counts.set(word, current + 1)

      if (!snippets.has(word)) {
        snippets.set(word, buildSnippet(text, rawWord))
      }
    })
  })

  const results = Array.from(counts.entries())
    .map(([word, count]) => {
      const rank = frequencyData.rankMap.get(word) || null
      const score = scoreWord({
        word,
        count,
        rank,
        threshold: profile.knownRankThreshold,
      })

      return {
        word,
        count,
        rank,
        score,
        snippet: snippets.get(word) || '',
        difficulty: difficultyLabel(rank),
      }
    })
    .filter((item) => {
      if (!item.rank) return item.word.length >= 5
      if (item.rank > profile.knownRankThreshold) return true
      return item.count >= 3 && item.word.length >= 8
    })
    .filter((item) => item.score >= 0.25)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0)
      return (b.rank || 999999) - (a.rank || 999999)
    })
    .slice(0, settings.maxResults)

  return {
    meta: {
      source: pageData.mode || 'page',
      pageTitle: pageData.title || '',
      pageUrl: pageData.url || '',
      videoId: pageData.videoId || '',
      channel: pageData.channel || '',
      levelLabel: profile.label,
      totalTokens,
      uniqueCandidates: counts.size,
      resultCount: results.length,
    },
    results,
  }
}
