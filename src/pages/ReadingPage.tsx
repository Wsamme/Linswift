import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Settings, Volume2, X, Check, Loader2, Plus } from 'lucide-react'
import { speakAuto } from '../lib/tts'
import { useVocabulary } from '../hooks/useVocabulary'
import { type UserBook } from '../lib/supabase'
import { analyzeUnfamiliarWords } from '../services/gemini'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { escapeRegExp, normalizeLookupKey } from '../lib/text'
import ClassicChapterReader from '../components/books/ClassicChapterReader'
import {
  fetchResolvedUserBook,
  getBookAnalysisExcerpt,
  loadCachedBookWords,
  saveCachedBookWords,
} from '../lib/books'
import { loadProcessedClassicBook, type ProcessedClassicBook } from '../lib/classicReader'
import { navigateSafely } from '../lib/navigation'

/**
 * 阅读界面（V2：从数据库加载真实内容）
 *
 * 功能：
 *   1. 从 URL 参数获取 bookId
 *   2. 加载书籍的 content_text 并按段落展示
 *   3. AI 分析陌生词汇并在文中高亮
 *   4. 点击词汇弹出详情弹窗
 *   5. 底部开关：自动翻译、自动收录
 *   6. 阅读进度自动保存
 */

// ===== 单词详情弹窗类型 =====
interface WordPopup {
  word: string
  meaning: string
  phonetic: string
}

export default function ReadingPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/bookshelf')
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')
  const { addWord, addWords } = useVocabulary()

  // ===== 书籍 & 文本状态 =====
  const [book, setBook] = useState<UserBook | null>(null)
  const [processedBook, setProcessedBook] = useState<ProcessedClassicBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [paragraphs, setParagraphs] = useState<string[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisStatus, setAnalysisStatus] = useState('')

  // ===== 陌生词汇（AI 分析结果） =====
  const [vocabMap, setVocabMap] = useState<Record<string, { meaning: string; phonetic: string }>>({})

  // ===== UI 状态 =====
  const [autoTranslate, setAutoTranslate] = useState(true)
  const [autoCollect, setAutoCollect] = useState(true)
  const [selectedWord, setSelectedWord] = useState<WordPopup | null>(null)
  const [learnedWords, setLearnedWords] = useState<Set<string>>(new Set())

  // ===== 加载书籍 =====
  useEffect(() => {
    let cancelled = false
    let progressTimer: number | null = null

    const stopProgress = () => {
      if (progressTimer !== null) {
        window.clearInterval(progressTimer)
        progressTimer = null
      }
    }

    const startAnalysisProgress = () => {
      const checkpoints = [
        { progress: 10, status: '正在准备段落...' },
        { progress: 24, status: '正在识别候选单词...' },
        { progress: 48, status: '正在请求 AI 分析...' },
        { progress: 74, status: '正在生成释义映射...' },
        { progress: 90, status: '即将完成...' },
      ]

      let index = 0
      setAnalysisProgress(checkpoints[0].progress)
      setAnalysisStatus(checkpoints[0].status)

      progressTimer = window.setInterval(() => {
        index = Math.min(index + 1, checkpoints.length - 1)
        setAnalysisProgress((prev) => Math.max(prev, checkpoints[index].progress))
        setAnalysisStatus(checkpoints[index].status)
      }, 650)
    }

    async function loadBook() {
      if (!bookId) {
        setLoading(false)
        return
      }

      const parsedId = parseInt(bookId, 10)
      if (Number.isNaN(parsedId)) {
        setLoading(false)
        return
      }

      const data = await fetchResolvedUserBook(parsedId, { includeSharedText: false })

      if (data) {
        setBook(data)

        if (data.shared_book_slug) {
          try {
            const nextProcessedBook = await loadProcessedClassicBook(data.shared_book_slug)
            if (cancelled) return
            setProcessedBook(nextProcessedBook)
          } catch {
            if (cancelled) return
          } finally {
            if (!cancelled) {
              setLoading(false)
            }
          }
          return
        }

        // 将文本按段落分割
        if (data.content_text) {
          const paras = data.content_text
            .split(/\n\n+/)
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0)
          setParagraphs(paras)
          setLoading(false)

          const cachedWords = loadCachedBookWords(data.id)
          if (cachedWords) {
            const map: Record<string, { meaning: string; phonetic: string }> = {}
            cachedWords.forEach((w) => {
              map[normalizeLookupKey(w.word)] = { meaning: w.meaning, phonetic: w.phonetic || '' }
            })
            setVocabMap(map)
            setAnalysisProgress(100)
            setAnalysisStatus(`已加载 ${cachedWords.length} 个缓存词汇`)
            return
          }

          // AI 分析陌生词汇
          try {
            setAnalyzing(true)
            startAnalysisProgress()
            const words = await analyzeUnfamiliarWords(getBookAnalysisExcerpt(data.content_text), 20)
            if (cancelled) return
            const map: Record<string, { meaning: string; phonetic: string }> = {}
            words.forEach(w => {
              map[normalizeLookupKey(w.word)] = { meaning: w.meaning, phonetic: w.phonetic || '' }
            })
            setVocabMap(map)
            saveCachedBookWords(data.id, words)
            stopProgress()
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
          } catch {
            if (cancelled) return
            stopProgress()
            setAnalysisStatus('陌生词分析失败，阅读不受影响')
          } finally {
            if (!cancelled) {
              setAnalyzing(false)
            }
          }
          return
        }

        setLoading(false)
        return
      }
      setLoading(false)
    }

    loadBook()

    return () => {
      cancelled = true
      stopProgress()
    }
  }, [addWords, autoCollect, bookId])

  // ===== 渲染段落文本（高亮陌生词汇） =====
  const vocabKeys = useMemo(() => Object.keys(vocabMap), [vocabMap])
  const vocabPattern = useMemo(
    () => vocabKeys.length > 0 ? new RegExp(`\\b(${vocabKeys.map(escapeRegExp).join('|')})\\b`, 'gi') : null,
    [vocabKeys]
  )

  const renderParagraph = (text: string) => {
    if (!vocabPattern) {
      return <span>{text}</span>
    }

    const parts = text.split(vocabPattern)
    return parts.map((part, i) => {
      const key = normalizeLookupKey(part)
      const vocabEntry = vocabMap[key]
      if (vocabEntry) {
        const isLearned = learnedWords.has(key)
        return (
          <span key={i}>
            <span
              className={`cursor-pointer transition-colors ${
                selectedWord?.word && normalizeLookupKey(selectedWord.word) === key
                  ? 'text-[var(--color-primary)] font-semibold bg-[var(--color-primary-light)] px-0.5 rounded'
                  : isLearned
                    ? 'text-[var(--color-success)]'
                    : 'text-[var(--color-primary)] underline decoration-dashed underline-offset-4'
              }`}
              onClick={() =>
                setSelectedWord({ word: part, meaning: vocabEntry.meaning, phonetic: vocabEntry.phonetic })
              }
            >
              {part}
            </span>
            {autoTranslate && !isLearned && (
              <span className="text-[11px] text-[var(--color-muted)]">({vocabEntry.meaning})</span>
            )}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  // ===== 标记 "我会了" =====
  const handleMarkLearned = () => {
    if (selectedWord) {
      setLearnedWords(prev => new Set([...prev, normalizeLookupKey(selectedWord.word)]))
      setSelectedWord(null)
    }
  }

  if (!loading && book?.shared_book_slug && processedBook) {
    return (
      <ClassicChapterReader
        book={book}
        processedBook={processedBook}
        onBack={goBack}
      />
    )
  }

  // ===== 加载中 =====
  if (loading) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
      </div>
    )
  }

  // ===== 无书籍 =====
  if (!book) {
    return (
      <div className="glass-page min-h-screen flex flex-col items-center justify-center px-8">
        <div className="glass-card w-full max-w-[320px] rounded-[28px] px-6 py-8 text-center">
          <p className="mb-4 text-[16px] font-semibold text-[var(--color-foreground)]">未找到书籍</p>
          <button
            onClick={() => navigateSafely(navigate, '/bookshelf')}
            className="glass-card-interactive inline-flex items-center justify-center rounded-[18px] bg-[var(--color-primary)] px-6 py-2.5 text-[14px] font-semibold text-white"
          >
            前往书架
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-page relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-[radial-gradient(circle_at_top_right,rgba(255,132,0,0.16),transparent_48%),radial-gradient(circle_at_left_top,rgba(255,230,205,0.52),transparent_44%)]" />
      {/* ===== Header ===== */}
      <div className="relative z-10 px-5 pt-5">
        <div className="glass-card flex items-center justify-between rounded-[28px] px-4 py-4">
          <button onClick={goBack} className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-2xl">
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <div className="min-w-0 flex-1 px-3 text-center">
            <h1 className="line-clamp-1 font-secondary text-[16px] font-bold text-[var(--color-foreground)]">
              {book.title}
            </h1>
            <p className="text-[11px] text-[var(--color-muted)]">{book.author}</p>
          </div>
          <button className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-2xl">
            <Settings size={18} className="text-[var(--color-muted)]" />
          </button>
        </div>
      </div>

      {/* ===== 文章内容 ===== */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4">
        {analyzing && (
          <div className="glass-card-soft mb-3 rounded-[20px] px-4 py-3">
            <div className="flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-[var(--color-foreground)]">正在识别陌生词汇</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{analysisStatus || '正在准备分析...'}</p>
              </div>
              <span className="text-[11px] font-semibold text-[var(--color-primary)]">{analysisProgress}%</span>
            </div>
            <div className="glass-card mt-2 h-1.5 overflow-hidden rounded-full border-0 shadow-none">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          </div>
        )}

        <div className="glass-card min-h-full rounded-[30px] px-5 py-6">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, i) => (
              <p key={i} className="mb-4 font-primary text-[15px] leading-[1.9] text-[var(--color-foreground)] last:mb-0">
                {renderParagraph(para)}
              </p>
            ))
          ) : (
            <div className="glass-card-soft py-12 text-center rounded-[24px]">
              <p className="text-[14px] text-[var(--color-muted)]">该书籍暂无可显示的文本内容</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== 单词详情弹窗 ===== */}
      {selectedWord && (
        <div
          className="glass-card-strong relative z-10 mx-5 mb-3 rounded-[28px] border border-[var(--color-primary)]/20 p-4"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-[18px] font-bold text-[var(--color-primary)]">{selectedWord.word}</h3>
              {selectedWord.phonetic && (
                <p className="text-[12px] text-[var(--color-muted)]">{selectedWord.phonetic}</p>
              )}
            </div>
            <button onClick={() => setSelectedWord(null)}>
              <X size={18} className="text-[var(--color-muted)]" />
            </button>
          </div>
          <p className="text-[14px] text-[var(--color-foreground)] mb-3">{selectedWord.meaning}</p>
          <div className="flex gap-2">
            <button
              className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-full"
              onClick={() => speakAuto(selectedWord.word)}
            >
              <Volume2 size={16} className="text-[var(--color-muted)]" />
            </button>
            <button
              onClick={() => {
                handleMarkLearned()
              }}
              className="glass-card-soft glass-card-interactive flex-1 flex items-center justify-center gap-2 rounded-[18px] border border-[var(--color-border)] bg-white py-2 text-[13px] font-semibold text-[var(--color-foreground)]"
            >
              <Check size={14} /> 我会了
            </button>
            <button
              onClick={() => {
                if (selectedWord) {
                  addWord({
                    word: selectedWord.word,
                    phonetic: selectedWord.phonetic,
                    meaning: selectedWord.meaning,
                    source: 'reading',
                  }).catch(() => {})
                  setSelectedWord(null)
                }
              }}
              className="glass-card-interactive flex-1 flex items-center justify-center gap-2 rounded-[18px] bg-[var(--color-primary)] py-2 text-[13px] font-semibold text-white"
            >
              <Plus size={14} /> 我不会
            </button>
          </div>
        </div>
      )}

      {/* ===== 底部设置栏 ===== */}
      <div className="glass-bottom-bar relative z-10 flex items-center justify-between px-5 py-3">
        {/* 自动翻译 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative ${autoTranslate ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-dark)]'}`}
            onClick={() => setAutoTranslate(!autoTranslate)}
          >
            <div
              className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full transition-transform shadow ${autoTranslate ? 'left-[20px]' : 'left-[2px]'}`}
            />
          </div>
          <span className="text-[12px] text-[var(--color-foreground)]">自动翻译</span>
        </label>

        {/* 自动收录 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative ${autoCollect ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border-dark)]'}`}
            onClick={() => setAutoCollect(!autoCollect)}
          >
            <div
              className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full transition-transform shadow ${autoCollect ? 'left-[20px]' : 'left-[2px]'}`}
            />
          </div>
          <span className="text-[12px] text-[var(--color-foreground)]">识词后自动加入词库</span>
        </label>
      </div>
    </div>
  )
}
