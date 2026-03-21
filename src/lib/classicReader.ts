import { getClassicBookBySlug, resolveClassicBookAssetUrl } from '../data/classicBooks'

export interface ClassicBookChapterData {
  id: string
  title: string
  sectionTitle: string | null
  paragraphs: string[]
  text: string
  wordCount: number
}

export interface ProcessedClassicBook {
  slug: string
  title: string
  author: string
  generatedAt: string
  chapterCount: number
  cleanedText: string
  chapters: ClassicBookChapterData[]
}

export interface ReaderPage {
  index: number
  chapterIndex: number
  pageNumberInChapter: number
  chapterPageCount: number
  chapterTitle: string
  sectionTitle: string | null
  paragraphs: string[]
  text: string
  characterCount: number
}

export type ReaderScanMode = 'chapter' | 'page-3' | 'page-5' | 'page-10'

export interface ReaderScanRecord {
  id: string
  scopeKey: string
  mode: ReaderScanMode
  label: string
  pageStart: number
  pageEnd: number
  chapterIndex: number
  createdAt: string
  words: Array<{ word: string; meaning: string; phonetic?: string }>
}

export interface ReaderBookmark {
  id: string
  label: string
  note: string
  pageIndex: number
  chapterIndex: number
  chapterTitle: string
  scopeKey: string | null
  createdAt: string
}

export interface ClassicReaderState {
  lastPageIndex: number
  scanMode: ReaderScanMode
  bookmarks: ReaderBookmark[]
  scanRecords: ReaderScanRecord[]
}

const processedBookCache = new Map<string, Promise<ProcessedClassicBook>>()
const CLASSIC_READER_STATE_PREFIX = 'linswift_classic_reader_state:'
const DEFAULT_SCAN_MODE: ReaderScanMode = 'page-5'

export function buildReaderPages(book: ProcessedClassicBook, targetCharsPerPage = 2400) {
  const draftPages: Array<Omit<ReaderPage, 'index' | 'chapterPageCount'>> = []

  book.chapters.forEach((chapter, chapterIndex) => {
    let pageParagraphs: string[] = []
    let pageCharCount = 0
    let pageNumberInChapter = 1

    const commitPage = () => {
      if (pageParagraphs.length === 0) return
      draftPages.push({
        chapterIndex,
        pageNumberInChapter,
        chapterTitle: chapter.title,
        sectionTitle: chapter.sectionTitle,
        paragraphs: [...pageParagraphs],
        text: pageParagraphs.join('\n\n'),
        characterCount: pageCharCount,
      })
      pageParagraphs = []
      pageCharCount = 0
      pageNumberInChapter += 1
    }

    chapter.paragraphs.forEach((paragraph) => {
      const nextLength = pageCharCount + paragraph.length
      if (pageParagraphs.length > 0 && nextLength > targetCharsPerPage) {
        commitPage()
      }

      pageParagraphs.push(paragraph)
      pageCharCount += paragraph.length
    })

    commitPage()
  })

  const chapterPageCountMap = draftPages.reduce<Record<number, number>>((acc, page) => {
    acc[page.chapterIndex] = (acc[page.chapterIndex] || 0) + 1
    return acc
  }, {})

  return draftPages.map((page, index) => ({
    ...page,
    index,
    chapterPageCount: chapterPageCountMap[page.chapterIndex] || 1,
  }))
}

export async function loadProcessedClassicBook(slug: string) {
  const cached = processedBookCache.get(slug)
  if (cached) return cached

  const classicBook = getClassicBookBySlug(slug)
  if (!classicBook) {
    throw new Error(`未知经典书 slug: ${slug}`)
  }

  const request = fetch(resolveClassicBookAssetUrl(classicBook.processedPath))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`经典书章节数据加载失败: ${response.status}`)
      }
      return response.json() as Promise<ProcessedClassicBook>
    })

  processedBookCache.set(slug, request)
  return request
}

function readerStateKey(bookId: number) {
  return `${CLASSIC_READER_STATE_PREFIX}${bookId}`
}

export function loadClassicReaderState(bookId: number): ClassicReaderState {
  try {
    const raw = localStorage.getItem(readerStateKey(bookId))
    if (!raw) {
      return {
        lastPageIndex: 0,
        scanMode: DEFAULT_SCAN_MODE,
        bookmarks: [],
        scanRecords: [],
      }
    }

    const parsed = JSON.parse(raw) as Partial<ClassicReaderState>
    return {
      lastPageIndex: typeof parsed.lastPageIndex === 'number' ? parsed.lastPageIndex : 0,
      scanMode: parsed.scanMode || DEFAULT_SCAN_MODE,
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      scanRecords: Array.isArray(parsed.scanRecords) ? parsed.scanRecords : [],
    }
  } catch {
    return {
      lastPageIndex: 0,
      scanMode: DEFAULT_SCAN_MODE,
      bookmarks: [],
      scanRecords: [],
    }
  }
}

export function saveClassicReaderState(bookId: number, state: ClassicReaderState) {
  localStorage.setItem(readerStateKey(bookId), JSON.stringify(state))
}

export function resolveScanScope(pages: ReaderPage[], currentPageIndex: number, mode: ReaderScanMode) {
  const currentPage = pages[currentPageIndex]
  if (!currentPage) return null

  if (mode === 'chapter') {
    const chapterPages = pages.filter((page) => page.chapterIndex === currentPage.chapterIndex)
    const pageStart = chapterPages[0]?.index ?? currentPageIndex
    const pageEnd = chapterPages.at(-1)?.index ?? currentPageIndex
    return {
      key: `chapter:${currentPage.chapterIndex}`,
      label: currentPage.sectionTitle
        ? `${currentPage.sectionTitle} · ${currentPage.chapterTitle}`
        : currentPage.chapterTitle,
      pageStart,
      pageEnd,
      chapterIndex: currentPage.chapterIndex,
      text: chapterPages.map((page) => page.text).join('\n\n'),
    }
  }

  const size = Number(mode.replace('page-', '')) || 5
  const startPage = Math.floor(currentPageIndex / size) * size
  const endPage = Math.min(pages.length - 1, startPage + size - 1)
  const scopedPages = pages.slice(startPage, endPage + 1)

  return {
    key: `pages:${startPage}-${endPage}`,
    label: `${scopedPages[0]?.chapterTitle || 'Reading'} · P${startPage + 1}-${endPage + 1}`,
    pageStart: startPage,
    pageEnd: endPage,
    chapterIndex: currentPage.chapterIndex,
    text: scopedPages.map((page) => page.text).join('\n\n'),
  }
}

export function createBookmarkPayload(page: ReaderPage, scopeKey: string | null, note = ''): ReaderBookmark {
  return {
    id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: `${page.chapterTitle} · P${page.index + 1}`,
    note,
    pageIndex: page.index,
    chapterIndex: page.chapterIndex,
    chapterTitle: page.chapterTitle,
    scopeKey,
    createdAt: new Date().toISOString(),
  }
}

export function createScanRecordPayload(
  mode: ReaderScanMode,
  scope: NonNullable<ReturnType<typeof resolveScanScope>>,
  words: ReaderScanRecord['words'],
): ReaderScanRecord {
  return {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scopeKey: scope.key,
    mode,
    label: scope.label,
    pageStart: scope.pageStart,
    pageEnd: scope.pageEnd,
    chapterIndex: scope.chapterIndex,
    createdAt: new Date().toISOString(),
    words,
  }
}

export function getProgressPercent(currentPageIndex: number, totalPages: number) {
  if (totalPages <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((currentPageIndex + 1) / totalPages) * 100)))
}
