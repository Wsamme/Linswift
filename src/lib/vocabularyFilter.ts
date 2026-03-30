import { normalizeWhitespace } from './text'

export interface ExtractedWordLike {
  word: string
  meaning?: string
  phonetic?: string
}

const COMMON_ABBREVIATIONS = new Set([
  'ai', 'api', 'app', 'asap', 'atm', 'bbc', 'bc', 'ceo', 'cfo', 'cio', 'coo', 'covid', 'cpu',
  'cto', 'diy', 'dm', 'dna', 'dr', 'e.g', 'eg', 'etc', 'faq', 'fbi', 'ft', 'gps', 'gpu', 'gtg',
  'html', 'http', 'https', 'id', 'ie', 'imo', 'imho', 'ios', 'ipa', 'iq', 'irl', 'it', 'lol',
  'ltd', 'mba', 'ml', 'mr', 'mrs', 'ms', 'nasa', 'nba', 'nfl', 'omg', 'pdf', 'phd', 'pm', 'ps',
  'rip', 'rn', 'sdk', 'sql', 'tb', 'tl;dr', 'tldr', 'tv', 'ufo', 'uk', 'usa', 'vip', 'vs', 'wifi',
  'wtf', 'www', 'xml',
])

const COMMON_NET_SLANG = new Set([
  'af', 'bff', 'bro', 'bruh', 'cringe', 'dm', 'fomo', 'ftw', 'goat', 'grwm', 'hashtag', 'hbd',
  'idk', 'ikr', 'irl', 'lmao', 'lmk', 'lowkey', 'meme', 'noob', 'nsfw', 'ofc', 'omg', 'oop',
  'op', 'otp', 'pls', 'pov', 'smh', 'stan', 'sus', 'tbh', 'tho', 'thx', 'tmi', 'troll', 'ttyl',
  'vibe', 'viral', 'wannabe', 'yolo',
])

const COMMON_PROPER_NAME_PARTICLES = new Set([
  'de', 'del', 'der', 'di', 'du', 'el', 'la', 'le', 'los', 'las', 'mac', 'mc', 'san', 'st', 'saint', 'van', 'von',
])

function normalizeExtractedWord(word: string) {
  return normalizeWhitespace(word)
    .replace(/[“”‘’]/g, '\'')
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
}

function hasSuspiciousCapitalization(rawWord: string) {
  const trimmed = normalizeWhitespace(rawWord)
  if (!trimmed) return false
  if (/^[A-Z][a-z]+(?:[-'][A-Z][a-z]+)+$/.test(trimmed)) return true
  if (/^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/.test(trimmed)) return true
  if (/^[A-Z][a-z]+$/.test(trimmed)) return true
  return false
}

function isAllCapsAbbreviation(word: string) {
  return /^[A-Z]{2,}$/.test(word) || /^[A-Za-z](?:\.[A-Za-z]){1,}\.?$/.test(word)
}

function isLikelyAbbreviation(word: string) {
  const normalized = word.toLowerCase()
  return COMMON_ABBREVIATIONS.has(normalized)
    || isAllCapsAbbreviation(word)
    || /^[a-z]{1,4}\d{1,3}$/i.test(word)
}

function isLikelyInternetSlang(word: string, meaning?: string) {
  const normalized = word.toLowerCase()
  const meaningText = String(meaning || '').toLowerCase()
  return COMMON_NET_SLANG.has(normalized)
    || meaningText.includes('网络用语')
    || meaningText.includes('缩写')
    || meaningText.includes('梗')
}

function isLikelyProperNoun(word: string, meaning?: string) {
  const normalized = word.toLowerCase()
  const meaningText = String(meaning || '').toLowerCase()
  return hasSuspiciousCapitalization(word)
    || COMMON_PROPER_NAME_PARTICLES.has(normalized)
    || meaningText.includes('人名')
    || meaningText.includes('地名')
    || meaningText.includes('城市')
    || meaningText.includes('国家')
    || meaningText.includes('品牌')
    || meaningText.includes('公司')
    || meaningText.includes('机构')
    || meaningText.includes('专有名词')
}

function isLikelyInventedWord(word: string, meaning?: string) {
  const normalized = word.toLowerCase()
  const meaningText = String(meaning || '').toLowerCase()

  return normalized.length > 20
    || /(.)\1{3,}/.test(normalized)
    || /[^aeiou]{5,}/i.test(normalized)
    || normalized.includes('xq')
    || normalized.includes('zx')
    || normalized.includes('qz')
    || meaningText.includes('杜撰')
    || meaningText.includes('自造')
    || meaningText.includes('虚构')
    || meaningText.includes('昵称')
}

export function isValidLearnableWord(word: string, meaning?: string) {
  const normalized = normalizeExtractedWord(word)
  if (!normalized) return false
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(normalized)) return false
  if (normalized.length < 2 || normalized.length > 18) return false
  if (/['-]{2,}/.test(normalized)) return false
  if (/^(?:[a-z]-){2,}[a-z]$/i.test(normalized)) return false

  if (isLikelyAbbreviation(normalized)) return false
  if (isLikelyInternetSlang(normalized, meaning)) return false
  if (isLikelyProperNoun(word, meaning)) return false
  if (isLikelyInventedWord(normalized, meaning)) return false

  return true
}

export function sanitizeExtractedWords<T extends ExtractedWordLike>(words: T[], maxWords?: number): T[] {
  const deduped = new Map<string, T>()

  for (const item of words) {
    const normalizedWord = normalizeExtractedWord(item.word)
    if (!isValidLearnableWord(item.word, item.meaning)) continue
    if (!normalizedWord) continue

    const normalizedKey = normalizedWord.toLowerCase()
    if (deduped.has(normalizedKey)) continue

    deduped.set(normalizedKey, {
      ...item,
      word: normalizedKey,
      meaning: typeof item.meaning === 'string' ? item.meaning.trim() : item.meaning,
      phonetic: typeof item.phonetic === 'string' ? item.phonetic.trim() : item.phonetic,
    })
  }

  const result = Array.from(deduped.values())
  return typeof maxWords === 'number' ? result.slice(0, maxWords) : result
}
