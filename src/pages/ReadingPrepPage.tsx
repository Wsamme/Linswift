import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, BookOpen, GraduationCap, Volume2, Loader2,
} from 'lucide-react'
import { supabase, type UserBook } from '../lib/supabase'
import { analyzeUnfamiliarWords, type UnfamiliarWord } from '../services/gemini'
import { speakEnglish } from '../lib/tts'
import { useLogicalBack } from '../hooks/useLogicalBack'
import {
  fetchResolvedUserBook,
  getBookAnalysisExcerpt,
  loadCachedBookWords,
  saveCachedBookWords,
} from '../lib/books'
import { getClassicBookBySlug } from '../data/classicBooks'
import ClassicBookCover from '../components/books/ClassicBookCover'
import { navigateSafely } from '../lib/navigation'

/**
 * 阅读准备页（V2：从数据库加载真实书籍）
 *
 * 流程：
 *   1. 通过 URL 参数 ?bookId=xxx 获取书籍 ID
 *   2. 从数据库加载书籍信息和提取的文本
 *   3. 调用 AI 分析文本中的陌生词汇
 *   4. 用户可选择 "先学习词汇"（卡片学习）或 "直接阅读"
 */

export default function ReadingPrepPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/bookshelf')
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')

  // ===== 状态 =====
  const [book, setBook] = useState<UserBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [unfamiliarWords, setUnfamiliarWords] = useState<UnfamiliarWord[]>([])
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const WORD_LIMIT = 12

  // ===== 加载书籍数据 =====
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
        { progress: 12, status: '正在准备文本片段...' },
        { progress: 28, status: '正在扫描高频词...' },
        { progress: 52, status: '正在请求 AI 识别陌生词...' },
        { progress: 76, status: '正在整理词汇结果...' },
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

      const data = await fetchResolvedUserBook(parsedId)

      if (data) {
        setBook(data)
        setLoading(false)

        // 如果有文本内容，调用 AI 分析陌生词汇
        if (data.content_text) {
          const cachedWords = loadCachedBookWords(data.id)
          if (cachedWords) {
            setUnfamiliarWords(cachedWords)
            setAnalysisProgress(100)
            setAnalysisStatus(`已加载 ${cachedWords.length} 个缓存词汇`)
            return
          }

          setAnalyzing(true)
          startAnalysisProgress()
          try {
            const words = await analyzeUnfamiliarWords(getBookAnalysisExcerpt(data.content_text), WORD_LIMIT)
            if (cancelled) return
            setUnfamiliarWords(words)
            saveCachedBookWords(data.id, words)
            stopProgress()
            setAnalysisProgress(100)
            setAnalysisStatus(`已识别 ${words.length} 个陌生词`)

            // 更新数据库中的陌生词汇数量
            await supabase
              .from('user_books')
              .update({ unfamiliar_words_count: words.length })
              .eq('id', data.id)
          } catch {
            if (cancelled) return
            stopProgress()
            setAnalysisStatus('陌生词分析失败，你仍可以直接阅读')
          } finally {
            if (!cancelled) {
              setAnalyzing(false)
            }
          }
        }
        return
      }

      setLoading(false)
    }

    loadBook()

    return () => {
      cancelled = true
      stopProgress()
    }
  }, [bookId])

  // ===== 难度颜色映射 =====
  const difficultyColor = (index: number) => {
    if (index < 4) return '#FF8400'    // 前几个词较简单 → 橙色
    if (index < 8) return '#8B5CF6'    // 中等 → 紫色
    return '#EF4444'                    // 后面的较难 → 红色
  }

  // ===== 加载中 =====
  if (loading) {
    return (
      <div className="glass-page min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
      </div>
    )
  }

  // ===== 无书籍数据（fallback 回旧版 mock 页面） =====
  if (!book) {
    return (
      <div className="glass-page min-h-screen flex flex-col items-center justify-center px-8">
        <div className="glass-card w-full max-w-[320px] rounded-[28px] px-6 py-8 text-center">
          <BookOpen size={48} className="text-[var(--color-muted)] mb-4 mx-auto" />
          <p className="mb-2 text-[16px] font-semibold text-[var(--color-foreground)]">未找到书籍</p>
          <p className="mb-6 text-center text-[13px] text-[var(--color-muted)]">
            请从书架选择一本书籍，或先导入 PDF
          </p>
          <button
            onClick={() => navigateSafely(navigate, '/bookshelf')}
            className="glass-card-interactive rounded-[18px] bg-[var(--color-primary)] px-6 py-2.5 text-[14px] font-semibold text-white"
          >
            前往书架
          </button>
        </div>
      </div>
    )
  }

  const classicBook = getClassicBookBySlug(book.shared_book_slug)

  return (
    <div className="glass-page relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[260px] bg-[radial-gradient(circle_at_top_right,rgba(255,132,0,0.16),transparent_46%),radial-gradient(circle_at_left_top,rgba(255,229,203,0.54),transparent_44%)]" />
      {/* ===== Header ===== */}
      <div className="relative z-10 px-5 pt-5">
        <div className="glass-card flex items-center gap-3 rounded-[28px] px-4 py-4">
          <button onClick={goBack} className="glass-card-soft flex h-10 w-10 items-center justify-center rounded-2xl">
            <ChevronLeft size={20} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="font-secondary text-[18px] font-bold text-[var(--color-foreground)]">阅读准备</h1>
        </div>
      </div>

      {/* ===== 书籍信息卡片 ===== */}
      <div className="relative z-10 mx-5 mb-4 mt-4 flex items-center gap-4 rounded-[28px] p-4 glass-card">
        <div className="h-[74px] w-[56px] shrink-0 overflow-hidden rounded-[14px]">
          {classicBook ? (
            <ClassicBookCover book={classicBook} compact />
          ) : (
            <div className="glass-card-soft flex h-full w-full items-center justify-center text-[28px]">
              {book.cover_emoji}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-bold text-[var(--color-foreground)] line-clamp-1">{book.title}</h2>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
            {book.author} · {book.total_pages ? `${book.total_pages} 页` : '未知页数'}
          </p>
          <p className="text-[12px] text-[var(--color-primary)] font-semibold mt-1">
            {analyzing
              ? analysisStatus || 'AI 正在分析陌生词汇...'
              : `AI 检测到 ${unfamiliarWords.length} 个陌生词汇`
            }
          </p>
        </div>
      </div>

      {/* ===== AI 分析中 ===== */}
      {analyzing && (
        <div className="glass-card-soft relative z-10 mx-5 mb-4 rounded-[24px] px-4 py-4">
          <div className="flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-[var(--color-primary)]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--color-foreground)]">正在识别陌生词汇</p>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">{analysisStatus || '正在准备分析...'}</p>
            </div>
            <span className="text-[12px] font-semibold text-[var(--color-primary)]">{analysisProgress}%</span>
          </div>
          <div className="glass-card mt-3 h-2 overflow-hidden rounded-full border-0 shadow-none">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-500"
              style={{ width: `${analysisProgress}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-muted-light)]">
            书已经打开，你可以先直接阅读；词汇结果会在分析完成后自动更新。
          </p>
        </div>
      )}

      {/* ===== 陌生词汇列表 ===== */}
      {!analyzing && unfamiliarWords.length > 0 && (
        <div className="relative z-10 flex-1 overflow-y-auto px-5">
          <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">
            建议先学习以下词汇
          </h3>
          <div className="space-y-2">
            {unfamiliarWords.map((w, i) => (
              <div
                key={i}
                className="glass-card-soft flex items-center gap-3 rounded-[20px] p-3"
              >
                {/* 序号 */}
                <div className="glass-pill flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <span className="text-[11px] font-bold text-[var(--color-muted)]">{i + 1}</span>
                </div>
                {/* 单词信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--color-foreground)]">{w.word}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{ color: difficultyColor(i), backgroundColor: `${difficultyColor(i)}15` }}
                    >
                      {i < 4 ? 'B1' : i < 8 ? 'B2' : 'C1'}
                    </span>
                  </div>
                  {w.phonetic && <p className="text-[11px] text-[var(--color-muted)]">{w.phonetic}</p>}
                  <p className="text-[12px] text-[var(--color-foreground)] mt-0.5">{w.meaning}</p>
                </div>
                {/* 发音按钮 */}
                <button
                  className="p-1.5 shrink-0"
                  onClick={() => speakEnglish(w.word)}
                >
                  <Volume2 size={16} className="text-[var(--color-muted)]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 无陌生词汇 */}
      {!analyzing && unfamiliarWords.length === 0 && (
        <div className="relative z-10 flex flex-1 items-center justify-center px-5">
          <div className="glass-card-soft w-full rounded-[24px] py-10 text-center">
            <p className="text-[32px] mb-2">🎉</p>
            <p className="text-[14px] text-[var(--color-muted)]">这段文本对你来说没有陌生词汇</p>
            <p className="text-[12px] text-[var(--color-muted-light)] mt-1">可以直接开始阅读</p>
          </div>
        </div>
      )}

      {/* ===== 底部操作按钮 ===== */}
      <div className="glass-bottom-bar relative z-10 flex gap-3 px-5 py-4">
        {/* 先学习 → 进入卡片学习页 */}
        <button
          onClick={() => navigate(`/flashcard?bookId=${book.id}`)}
          disabled={unfamiliarWords.length === 0 || analyzing}
          className="glass-card-interactive flex-1 flex items-center justify-center gap-2 rounded-[18px] bg-[var(--color-primary)] py-3.5 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          <GraduationCap size={18} />
          先学习词汇
        </button>
        {/* 直接阅读 → 进入阅读界面 */}
        <button
          onClick={() => navigate(`/reading?bookId=${book.id}`)}
          className="glass-card-soft glass-card-interactive flex-1 flex items-center justify-center gap-2 rounded-[18px] py-3.5 text-[14px] font-semibold text-[var(--color-foreground)]"
        >
          <BookOpen size={18} />
          直接阅读
        </button>
      </div>
    </div>
  )
}
