import { sanitizeExtractedWords, type ExtractedWordLike } from './vocabularyFilter'

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en'

const whitelistCache = new Map<string, Promise<boolean>>()

function normalizeLookupWord(word: string) {
  return String(word || '')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, '\'')
}

function buildDictionaryLookupCandidates(word: string) {
  const normalized = normalizeLookupWord(word)
  const candidates = new Set<string>()
  const push = (value: string) => {
    const next = normalizeLookupWord(value)
    if (next && next.length > 1) candidates.add(next)
  }

  push(normalized)

  if (normalized.endsWith('ies') && normalized.length > 4) {
    push(`${normalized.slice(0, -3)}y`)
  }
  if (normalized.endsWith('es') && normalized.length > 4) {
    push(normalized.slice(0, -2))
  }
  if (normalized.endsWith('s') && normalized.length > 3 && !normalized.endsWith('ss')) {
    push(normalized.slice(0, -1))
  }
  if (normalized.endsWith('ing') && normalized.length > 5) {
    push(normalized.slice(0, -3))
    push(`${normalized.slice(0, -3)}e`)
  }
  if (normalized.endsWith('ed') && normalized.length > 4) {
    push(normalized.slice(0, -2))
    push(normalized.slice(0, -1))
    push(`${normalized.slice(0, -2)}e`)
  }

  return Array.from(candidates)
}

async function fetchDictionaryEntry(word: string) {
  const response = await fetch(`${DICTIONARY_API_BASE}/${encodeURIComponent(word)}`)
  if (!response.ok) return null

  const payload = await response.json().catch(() => null)
  return Array.isArray(payload) ? payload.filter(Boolean) : null
}

export async function hasDictionaryWhitelistEntry(word: string) {
  const normalized = normalizeLookupWord(word)
  if (!normalized) return false

  const cached = whitelistCache.get(normalized)
  if (cached) return cached

  const task = (async () => {
    const candidates = buildDictionaryLookupCandidates(normalized)

    for (const candidate of candidates) {
      try {
        const entry = await fetchDictionaryEntry(candidate)
        if (Array.isArray(entry) && entry.length > 0) {
          return true
        }
      } catch {
        continue
      }
    }

    return false
  })()

  whitelistCache.set(normalized, task)
  return task
}

export async function filterDictionaryWhitelistedWords<T extends ExtractedWordLike>(words: T[], maxWords?: number): Promise<T[]> {
  const sanitized = sanitizeExtractedWords(words, maxWords)
  const flags = await Promise.all(sanitized.map((item) => hasDictionaryWhitelistEntry(item.word)))
  const filtered = sanitized.filter((_, index) => flags[index])
  return typeof maxWords === 'number' ? filtered.slice(0, maxWords) : filtered
}
