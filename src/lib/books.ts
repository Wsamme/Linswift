import { getClassicBookBySlug, resolveClassicBookAssetUrl } from '../data/classicBooks'
import type { UnfamiliarWord } from '../services/gemini'
import { sanitizeText } from './pdf'
import { supabase, type UserBook } from './supabase'

const classicBookTextCache = new Map<string, Promise<string>>()

function stripProjectGutenbergBoilerplate(rawText: string) {
  let text = rawText.replace(/^\uFEFF/, '')

  const startMatch = text.match(/\*\*\*\s*START OF THE PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i)
  if (startMatch?.index !== undefined) {
    text = text.slice(startMatch.index + startMatch[0].length)
  }

  const endMatch = text.match(/\*\*\*\s*END OF THE PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i)
  if (endMatch?.index !== undefined) {
    text = text.slice(0, endMatch.index)
  }

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function resolveUserBookMetadata<T extends UserBook>(book: T): T {
  const classicBook = getClassicBookBySlug(book.shared_book_slug)
  if (!classicBook) return book

  return {
    ...book,
    title: book.title || classicBook.title,
    author: book.author || classicBook.author,
    cover_emoji: book.cover_emoji || classicBook.coverEmoji,
  }
}

export async function loadClassicBookText(sharedBookSlug: string) {
  const cached = classicBookTextCache.get(sharedBookSlug)
  if (cached) return cached

  const classicBook = getClassicBookBySlug(sharedBookSlug)
  if (!classicBook) {
    throw new Error(`未知经典书 slug: ${sharedBookSlug}`)
  }

  const fetchTask = fetch(resolveClassicBookAssetUrl(classicBook.assetPath))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`经典书正文加载失败: ${response.status}`)
      }
      return response.text()
    })
    .then(stripProjectGutenbergBoilerplate)
    .then((text) => sanitizeText(text))

  classicBookTextCache.set(sharedBookSlug, fetchTask)
  return fetchTask
}

interface HydrateUserBookContentOptions {
  includeSharedText?: boolean
}

export async function hydrateUserBookContent(book: UserBook, options: HydrateUserBookContentOptions = {}) {
  const { includeSharedText = true } = options
  const resolvedBook = resolveUserBookMetadata(book)
  if (resolvedBook.content_text || !resolvedBook.shared_book_slug || !includeSharedText) {
    return resolvedBook
  }

  const contentText = await loadClassicBookText(resolvedBook.shared_book_slug)
  return {
    ...resolvedBook,
    content_text: contentText,
  }
}

export async function fetchResolvedUserBook(bookId: number, options: HydrateUserBookContentOptions = {}) {
  const { data, error } = await supabase
    .from('user_books')
    .select('*')
    .eq('id', bookId)
    .single()

  if (error || !data) {
    return null
  }

  return hydrateUserBookContent(data as UserBook, options)
}

export function getBookAnalysisExcerpt(contentText: string | null, maxChars = 18000) {
  if (!contentText) return ''

  const normalized = sanitizeText(contentText)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized.slice(0, maxChars)
}

export function loadCachedBookWords(bookId: number) {
  const keys = [`bookWords:${bookId}`, `readingPrepWords:${bookId}`]

  for (const key of keys) {
    const raw = sessionStorage.getItem(key)
    if (!raw) continue

    try {
      const parsed = JSON.parse(raw) as UnfamiliarWord[]
      if (Array.isArray(parsed) && parsed.length >= 0) {
        return parsed
      }
    } catch {
      sessionStorage.removeItem(key)
    }
  }

  return null
}

export function saveCachedBookWords(bookId: number, words: UnfamiliarWord[]) {
  const serialized = JSON.stringify(words)
  sessionStorage.setItem(`bookWords:${bookId}`, serialized)
  sessionStorage.setItem(`readingPrepWords:${bookId}`, serialized)
}
