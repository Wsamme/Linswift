import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bookmark,
  BookmarkPlus,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Loader2,
  Plus,
  ScanSearch,
  Settings2,
  Volume2,
  X,
} from 'lucide-react'
import type { UserBook } from '../../lib/supabase'
import { useVocabulary } from '../../hooks/useVocabulary'
import { analyzeUnfamiliarWords } from '../../services/gemini'
import { speakAuto } from '../../lib/tts'
import { escapeRegExp, normalizeLookupKey } from '../../lib/text'
import {
  buildReaderPages,
  createBookmarkPayload,
  createScanRecordPayload,
  getProgressPercent,
  loadClassicReaderState,
  resolveScanScope,
  saveClassicReaderState,
  type ProcessedClassicBook,
  type ReaderBookmark,
  type ReaderScanMode,
  type ReaderScanRecord,
} from '../../lib/classicReader'
import { getBookAnalysisExcerpt } from '../../lib/books'
import { supabase } from '../../lib/supabase'

interface SelectedWordState {
  word: string
  meaning: string
  phonetic?: string
}

interface ClassicChapterReaderProps {
  book: UserBook
  processedBook: ProcessedClassicBook
  onBack: () => void
}

const SCAN_MODE_OPTIONS: Array<{ value: ReaderScanMode; label: string; description: string }> = [
  { value: 'page-3', label: '每 3 页', description: '适合短频快复习' },
  { value: 'page-5', label: '每 5 页', description: '默认平衡模式' },
  { value: 'page-10', label: '每 10 页', description: '减少识词频率' },
  { value: 'chapter', label: '按章节', description: '每章做一次识词' },
]

function buildVocabMap(scanRecord: ReaderScanRecord | null) {
  const map: Record<string, { meaning: string; phonetic: string }> = {}
  scanRecord?.words.forEach((word) => {
    map[normalizeLookupKey(word.word)] = {
      meaning: word.meaning,
      phonetic: word.phonetic || '',
    }
  })
  return map
}

export default function ClassicChapterReader({ book, processedBook, onBack }: ClassicChapterReaderProps) {
  const { addWord, addWords } = useVocabulary()
  const pages = useMemo(() => buildReaderPages(processedBook), [processedBook])
  const chapterStartPages = useMemo(() => {
    const indices: number[] = []
    pages.forEach((page) => {
      if (indices[page.chapterIndex] === undefined) {
        indices[page.chapterIndex] = page.index
      }
    })
    return indices
  }, [pages])

  const initialState = useMemo(() => loadClassicReaderState(book.id), [book.id])

  const [currentPageIndex, setCurrentPageIndex] = useState(() => {
    const fallback = Math.max(0, (book.current_page || 1) - 1)
    return Math.min(initialState.lastPageIndex ?? fallback, Math.max(0, pages.length - 1))
  })
  const [scanMode, setScanMode] = useState<ReaderScanMode>(initialState.scanMode)
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>(initialState.bookmarks)
  const [scanRecords, setScanRecords] = useState<ReaderScanRecord[]>(initialState.scanRecords)
  const [showToc, setShowToc] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedWord, setSelectedWord] = useState<SelectedWordState | null>(null)
  const [learnedWords, setLearnedWords] = useState<Set<string>>(new Set())
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [autoTranslate, setAutoTranslate] = useState(true)
  const [autoCollect, setAutoCollect] = useState(true)

  const currentPage = pages[currentPageIndex]
  const currentScope = useMemo(
    () => resolveScanScope(pages, currentPageIndex, scanMode),
    [pages, currentPageIndex, scanMode],
  )
  const currentScanRecord = useMemo(
    () => (currentScope ? scanRecords.find((record) => record.scopeKey === currentScope.key) ?? null : null),
    [scanRecords, currentScope],
  )
  const vocabMap = useMemo(() => buildVocabMap(currentScanRecord), [currentScanRecord])
  const vocabKeys = useMemo(() => Object.keys(vocabMap), [vocabMap])
  const vocabPattern = useMemo(
    () => vocabKeys.length > 0 ? new RegExp(`\\b(${vocabKeys.map(escapeRegExp).join('|')})\\b`, 'gi') : null,
    [vocabKeys],
  )

  useEffect(() => {
    saveClassicReaderState(book.id, {
      lastPageIndex: currentPageIndex,
      scanMode,
      bookmarks,
      scanRecords,
    })
  }, [book.id, currentPageIndex, scanMode, bookmarks, scanRecords])

  useEffect(() => {
    if (!pages[currentPageIndex]) return

    const progress = getProgressPercent(currentPageIndex, pages.length)
    const timer = window.setTimeout(() => {
      void supabase
        .from('user_books')
        .update({
          current_page: currentPageIndex + 1,
          progress,
        })
        .eq('id', book.id)
    }, 500)

    return () => window.clearTimeout(timer)
  }, [book.id, currentPageIndex, pages.length])

  useEffect(() => {
    if (!currentScope || currentScanRecord || !currentPage) return

    let cancelled = false
    let timer: number | null = null

    const checkpoints = [
      { progress: 12, status: '正在准备当前阅读片段...' },
      { progress: 34, status: '正在提取候选词...' },
      { progress: 58, status: '正在请求 AI 识词...' },
      { progress: 82, status: '正在整理词卡...' },
      { progress: 95, status: '即将完成...' },
    ]

    let index = 0
    setAnalyzing(true)
    setAnalysisProgress(checkpoints[0].progress)
    setAnalysisStatus(checkpoints[0].status)

    timer = window.setInterval(() => {
      index = Math.min(index + 1, checkpoints.length - 1)
      setAnalysisProgress((prev) => Math.max(prev, checkpoints[index].progress))
      setAnalysisStatus(checkpoints[index].status)
    }, 650)

    void analyzeUnfamiliarWords(getBookAnalysisExcerpt(currentScope.text), 16)
      .then(async (words) => {
        if (cancelled) return
        const record = createScanRecordPayload(scanMode, currentScope, words)
        setScanRecords((prev) => [...prev.filter((item) => item.scopeKey !== currentScope.key), record])
        setAnalysisProgress(100)
        if (autoCollect && words.length > 0) {
          await addWords(words.map((word) => ({
            word: word.word,
            phonetic: word.phonetic,
            meaning: word.meaning,
            source: 'reading',
          })))
          if (!cancelled) {
            setAnalysisStatus(`已识别 ${words.length} 个重点词，并自动加入词库`)
          }
        } else {
          setAnalysisStatus(`已识别 ${words.length} 个重点词，等待你逐个判断`)
        }
      })
      .catch(() => {
        if (cancelled) return
        setAnalysisStatus('识词失败，但阅读不受影响')
      })
      .finally(() => {
        if (timer !== null) {
          window.clearInterval(timer)
        }
        if (!cancelled) {
          setAnalyzing(false)
        }
      })

    return () => {
      cancelled = true
      if (timer !== null) {
        window.clearInterval(timer)
      }
    }
  }, [addWords, autoCollect, currentScope, currentScanRecord, currentPage, scanMode])

  const renderParagraph = useCallback((text: string) => {
    if (!vocabPattern) {
      return <span>{text}</span>
    }

    return text.split(vocabPattern).map((part, index) => {
      const key = normalizeLookupKey(part)
      const entry = vocabMap[key]
      if (!entry) {
        return <span key={`${part}-${index}`}>{part}</span>
      }

      const isLearned = learnedWords.has(key)
      return (
        <span key={`${part}-${index}`}>
          <button
            type="button"
            className={`inline rounded px-0.5 text-left transition-colors ${
              isLearned
                ? 'text-[var(--color-success)]'
                : 'text-[var(--color-primary)] underline decoration-dashed underline-offset-4'
            }`}
            onClick={async () => {
              setSelectedWord({ word: part, meaning: entry.meaning, phonetic: entry.phonetic })
            }}
          >
            {part}
          </button>
          {autoTranslate && !isLearned && (
            <span className="text-[11px] text-[var(--color-muted)]">({entry.meaning})</span>
          )}
        </span>
      )
    })
  }, [addWord, autoCollect, autoTranslate, learnedWords, vocabMap, vocabPattern])

  const addBookmark = useCallback(() => {
    if (!currentPage) return
    const bookmark = createBookmarkPayload(currentPage, currentScope?.key ?? null)
    setBookmarks((prev) => [bookmark, ...prev.filter((item) => item.pageIndex !== bookmark.pageIndex)])
  }, [currentPage, currentScope])

  const currentBookmark = bookmarks.find((bookmark) => bookmark.pageIndex === currentPageIndex) ?? null
  const progressPercent = getProgressPercent(currentPageIndex, pages.length)

  if (!currentPage) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  return (
    <div className="glass-page relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[240px] bg-[radial-gradient(circle_at_top_right,rgba(255,132,0,0.14),transparent_46%),radial-gradient(circle_at_left_top,rgba(255,228,201,0.5),transparent_44%)]" />

      <div className="relative z-10 px-5 pt-5">
        <div className="glass-card rounded-[28px] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <button onClick={onBack} className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-2xl">
              <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
            </button>

            <div className="min-w-0 flex-1 text-center">
              <p className="line-clamp-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                {currentPage.sectionTitle || 'Classic Reader'}
              </p>
              <h1 className="line-clamp-1 font-secondary text-[17px] font-bold text-[var(--color-foreground)]">
                {currentPage.chapterTitle}
              </h1>
              <p className="text-[11px] text-[var(--color-muted)]">
                {book.title} · 第 {currentPage.index + 1}/{pages.length} 页
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowToc(true)}
                className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-2xl"
                title="目录"
              >
                <ListTree size={18} className="text-[var(--color-muted)]" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-2xl"
                title="识词设置"
              >
                <Settings2 size={18} className="text-[var(--color-muted)]" />
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="glass-card h-2 overflow-hidden rounded-full border-0 shadow-none">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
              <span>{currentPage.chapterTitle}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-5 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={addBookmark}
            className="glass-card-soft flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[12px] font-semibold text-[var(--color-foreground)]"
          >
            <BookmarkPlus size={14} className="text-[var(--color-primary)]" />
            {currentBookmark ? '已加书签' : '加入书签'}
          </button>
          <button
            onClick={() => setShowBookmarks(true)}
            className="glass-card-soft flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[12px] font-semibold text-[var(--color-foreground)]"
          >
            <Bookmark size={14} className="text-[var(--color-primary)]" />
            书签 {bookmarks.length}
          </button>
          <div className="glass-card-soft flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[12px] text-[var(--color-muted)]">
            <ScanSearch size={14} className="text-[var(--color-primary)]" />
            {SCAN_MODE_OPTIONS.find((item) => item.value === scanMode)?.label}
          </div>
          <div className="glass-card-soft flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[12px] text-[var(--color-muted)]">
            <BookOpenText size={14} className="text-[var(--color-primary)]" />
            已识别 {scanRecords.length} 段
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4">
        {analyzing && (
          <div className="glass-card-soft mb-3 rounded-[22px] px-4 py-3">
            <div className="flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[var(--color-foreground)]">正在识别当前阅读段落的重点词汇</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{analysisStatus || '正在准备分析...'}</p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--color-primary)]">{analysisProgress}%</span>
            </div>
            <div className="glass-card mt-2 h-1.5 overflow-hidden rounded-full border-0 shadow-none">
              <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500" style={{ width: `${analysisProgress}%` }} />
            </div>
          </div>
        )}

        <div className="glass-card rounded-[30px] px-5 py-6">
          {currentPage.paragraphs.map((paragraph, index) => (
            <p key={`${currentPage.index}-${index}`} className="mb-4 font-primary text-[15px] leading-[1.95] text-[var(--color-foreground)] last:mb-0">
              {renderParagraph(paragraph)}
            </p>
          ))}
        </div>
      </div>

      <div className="glass-bottom-bar relative z-10 flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentPageIndex === 0}
          className="glass-card-soft glass-card-interactive flex flex-1 items-center justify-center gap-2 rounded-[18px] py-3 text-[14px] font-semibold text-[var(--color-foreground)] disabled:opacity-40"
        >
          <ChevronLeft size={18} />
          上一页
        </button>
        <button
          onClick={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
          disabled={currentPageIndex >= pages.length - 1}
          className="glass-card-interactive flex flex-1 items-center justify-center gap-2 rounded-[18px] bg-[var(--color-primary)] py-3 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          下一页
          <ChevronRight size={18} />
        </button>
      </div>

      {selectedWord && (
        <div className="fixed inset-x-4 bottom-5 z-40 mx-auto max-w-[960px]">
          <div className="glass-card-strong rounded-[28px] border border-[var(--color-primary)]/20 p-4 shadow-[0_24px_60px_rgba(20,10,0,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[24px] font-bold text-[var(--color-primary)]">{selectedWord.word}</p>
                {selectedWord.phonetic && <p className="mt-1 text-[12px] text-[var(--color-muted)]">{selectedWord.phonetic}</p>}
                <p className="mt-3 text-[16px] font-medium text-[var(--color-foreground)]">{selectedWord.meaning}</p>
              </div>
              <button onClick={() => setSelectedWord(null)} className="p-1">
                <X size={18} className="text-[var(--color-muted)]" />
              </button>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="glass-card-soft flex h-12 w-12 items-center justify-center rounded-full"
                onClick={() => speakAuto(selectedWord.word)}
              >
                <Volume2 size={18} className="text-[var(--color-muted)]" />
              </button>
              <button
                className="glass-card-soft glass-card-interactive flex-1 rounded-[18px] border border-[var(--color-border)] bg-white px-4 py-3 text-[15px] font-semibold text-[var(--color-foreground)]"
                onClick={() => {
                  const key = normalizeLookupKey(selectedWord.word)
                  setLearnedWords((prev) => new Set([...prev, key]))
                  setSelectedWord(null)
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Check size={16} />
                  我会了
                </span>
              </button>
              <button
                className="glass-card-interactive flex-1 rounded-[18px] bg-[var(--color-primary)] px-4 py-3 text-[15px] font-semibold text-white"
                onClick={async () => {
                  await addWord({
                    word: selectedWord.word,
                    phonetic: selectedWord.phonetic,
                    meaning: selectedWord.meaning,
                    source: 'reading',
                  })
                  setSelectedWord(null)
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  我不会
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {(showToc || showBookmarks || showSettings) && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px]" onClick={() => {
          setShowToc(false)
          setShowBookmarks(false)
          setShowSettings(false)
        }} />
      )}

      {showToc && (
        <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-[380px] flex-col overflow-hidden bg-white/92 p-4 shadow-[-18px_0_60px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-secondary text-[18px] font-bold text-[var(--color-foreground)]">章节目录</h3>
            <button onClick={() => setShowToc(false)}><X size={18} className="text-[var(--color-muted)]" /></button>
          </div>
          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {processedBook.chapters.map((chapter, chapterIndex) => {
              const pageIndex = chapterStartPages[chapterIndex] ?? 0
              const active = chapterIndex === currentPage.chapterIndex
              return (
                <button
                  key={chapter.id}
                  onClick={() => {
                    setCurrentPageIndex(pageIndex)
                    setShowToc(false)
                  }}
                  className={`w-full rounded-[18px] px-4 py-3 text-left transition-colors ${
                    active ? 'bg-[var(--color-primary)] text-white' : 'bg-white/70 text-[var(--color-foreground)]'
                  }`}
                >
                  <p className={`text-[11px] ${active ? 'text-white/80' : 'text-[var(--color-muted)]'}`}>
                    {chapter.sectionTitle || 'Chapter'} · P{pageIndex + 1}
                  </p>
                  <p className="mt-1 text-[14px] font-semibold">{chapter.title}</p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {showBookmarks && (
        <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-[380px] flex-col overflow-hidden bg-white/92 p-4 shadow-[-18px_0_60px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-secondary text-[18px] font-bold text-[var(--color-foreground)]">书签</h3>
            <button onClick={() => setShowBookmarks(false)}><X size={18} className="text-[var(--color-muted)]" /></button>
          </div>
          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto pb-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {bookmarks.length === 0 && (
              <div className="rounded-[18px] bg-white/70 px-4 py-5 text-[13px] text-[var(--color-muted)]">
                还没有书签。你可以在当前页点击“加入书签”。
              </div>
            )}
            {bookmarks.map((bookmark) => {
              const linkedRecord = bookmark.scopeKey ? scanRecords.find((record) => record.scopeKey === bookmark.scopeKey) : null
              return (
                <div key={bookmark.id} className="rounded-[18px] bg-white/72 px-4 py-3">
                  <button
                    onClick={() => {
                      setCurrentPageIndex(bookmark.pageIndex)
                      setShowBookmarks(false)
                    }}
                    className="w-full text-left"
                  >
                    <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{bookmark.label}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                      {new Date(bookmark.createdAt).toLocaleString('zh-CN')}
                    </p>
                    {linkedRecord && (
                      <p className="mt-2 text-[11px] text-[var(--color-primary)]">
                        关联识词：{linkedRecord.words.length} 个
                      </p>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-[380px] flex-col overflow-hidden bg-white/92 p-4 shadow-[-18px_0_60px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-secondary text-[18px] font-bold text-[var(--color-foreground)]">识词设置</h3>
            <button onClick={() => setShowSettings(false)}><X size={18} className="text-[var(--color-muted)]" /></button>
          </div>

          <div
            className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div>
              <p className="mb-2 text-[13px] font-semibold text-[var(--color-foreground)]">识词频率</p>
              <div className="space-y-2">
                {SCAN_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setScanMode(option.value)}
                    className={`w-full rounded-[18px] px-4 py-3 text-left ${
                      scanMode === option.value ? 'bg-[var(--color-primary)] text-white' : 'bg-white/70'
                    }`}
                  >
                    <p className="text-[14px] font-semibold">{option.label}</p>
                    <p className={`mt-1 text-[11px] ${scanMode === option.value ? 'text-white/80' : 'text-[var(--color-muted)]'}`}>
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
                <span className="text-[13px] font-semibold text-[var(--color-foreground)]">自动翻译高亮词</span>
                <input type="checkbox" checked={autoTranslate} onChange={() => setAutoTranslate((prev) => !prev)} />
              </label>
              <label className="flex items-center justify-between rounded-[18px] bg-white/70 px-4 py-3">
                <span className="text-[13px] font-semibold text-[var(--color-foreground)]">识词后自动加入词库</span>
                <input type="checkbox" checked={autoCollect} onChange={() => setAutoCollect((prev) => !prev)} />
              </label>
              <p className="px-1 text-[11px] leading-5 text-[var(--color-muted)]">
                开启后，AI 识别出的重点词会整批加入个人词库；关闭后，由你在词卡里逐个点“我不会”再加入。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
