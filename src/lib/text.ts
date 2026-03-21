const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/
const JAPANESE_RE = /[\u3040-\u30ff]/
const LATIN_RE = /[A-Za-z]/

export function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

export function isCjkText(text: string) {
  return CJK_RE.test(text)
}

export function isJapaneseText(text: string) {
  return JAPANESE_RE.test(text)
}

export function hasLatinText(text: string) {
  return LATIN_RE.test(text)
}

export function normalizeLookupKey(text: string) {
  return normalizeWhitespace(text).toLocaleLowerCase()
}

export function normalizeVocabWord(text: string) {
  const normalized = normalizeWhitespace(text)
  if (!normalized) return ''
  return hasLatinText(normalized) ? normalized.toLocaleLowerCase() : normalized
}

export function matchesSearchText(value: string | null | undefined, query: string) {
  const source = normalizeWhitespace(value || '')
  const target = normalizeWhitespace(query)
  if (!target) return true
  return source.toLocaleLowerCase().includes(target.toLocaleLowerCase()) || source.includes(target)
}

export function shouldShowPhonetic(word: string, phonetic?: string | null) {
  return Boolean(phonetic?.trim()) && !isCjkText(word)
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
