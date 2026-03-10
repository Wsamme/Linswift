import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, BookOpen, GraduationCap, Volume2, Loader2,
} from 'lucide-react'
import { supabase, type UserBook } from '../lib/supabase'
import { analyzeUnfamiliarWords, type UnfamiliarWord } from '../services/gemini'
import { speakEnglish } from '../lib/tts'

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
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')

  // ===== 状态 =====
  const [book, setBook] = useState<UserBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [unfamiliarWords, setUnfamiliarWords] = useState<UnfamiliarWord[]>([])

  // ===== 加载书籍数据 =====
  useEffect(() => {
    async function loadBook() {
      if (!bookId) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_books')
        .select('*')
        .eq('id', parseInt(bookId))
        .single()

      if (!error && data) {
        setBook(data)

        // 如果有文本内容，调用 AI 分析陌生词汇
        if (data.content_text) {
          setAnalyzing(true)
          try {
            const words = await analyzeUnfamiliarWords(data.content_text, 12)
            setUnfamiliarWords(words)

            // 更新数据库中的陌生词汇数量
            await supabase
              .from('user_books')
              .update({ unfamiliar_words_count: words.length })
              .eq('id', data.id)
          } catch {
            // AI 分析失败，静默处理
          } finally {
            setAnalyzing(false)
          }
        }
      }
      setLoading(false)
    }

    loadBook()
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
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
      </div>
    )
  }

  // ===== 无书籍数据（fallback 回旧版 mock 页面） =====
  if (!book) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8">
        <BookOpen size={48} className="text-[var(--color-muted)] mb-4" />
        <p className="text-[16px] text-[var(--color-foreground)] font-semibold mb-2">未找到书籍</p>
        <p className="text-[13px] text-[var(--color-muted)] text-center mb-6">
          请从书架选择一本书籍，或先导入 PDF
        </p>
        <button
          onClick={() => navigate('/bookshelf')}
          className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold"
        >
          前往书架
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">阅读准备</h1>
      </div>

      {/* ===== 书籍信息卡片 ===== */}
      <div
        className="mx-5 mb-4 p-4 bg-[var(--color-primary-light)] rounded-[var(--radius-md)] flex items-center gap-4"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="w-[50px] h-[65px] rounded-[8px] bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0 text-[28px]">
          {book.cover_emoji}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-bold text-[var(--color-foreground)] line-clamp-1">{book.title}</h2>
          <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
            {book.author} · {book.total_pages ? `${book.total_pages} 页` : '未知页数'}
          </p>
          <p className="text-[12px] text-[var(--color-primary)] font-semibold mt-1">
            {analyzing
              ? 'AI 正在分析陌生词汇...'
              : `AI 检测到 ${unfamiliarWords.length} 个陌生词汇`
            }
          </p>
        </div>
      </div>

      {/* ===== AI 分析中 ===== */}
      {analyzing && (
        <div className="mx-5 mb-4 flex items-center justify-center gap-3 py-8">
          <Loader2 size={20} className="text-[var(--color-primary)] animate-spin" />
          <span className="text-[14px] text-[var(--color-muted)]">正在用 AI 分析文本中的陌生词汇...</span>
        </div>
      )}

      {/* ===== 陌生词汇列表 ===== */}
      {!analyzing && unfamiliarWords.length > 0 && (
        <div className="flex-1 px-5 overflow-y-auto">
          <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">
            建议先学习以下词汇
          </h3>
          <div className="space-y-2">
            {unfamiliarWords.map((w, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)]"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {/* 序号 */}
                <div className="w-6 h-6 rounded-full bg-[var(--color-background-secondary)] flex items-center justify-center shrink-0">
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
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[32px] mb-2">🎉</p>
            <p className="text-[14px] text-[var(--color-muted)]">这段文本对你来说没有陌生词汇</p>
            <p className="text-[12px] text-[var(--color-muted-light)] mt-1">可以直接开始阅读</p>
          </div>
        </div>
      )}

      {/* ===== 底部操作按钮 ===== */}
      <div className="px-5 py-4 flex gap-3 bg-[var(--color-background)] border-t border-[var(--color-border)]">
        {/* 先学习 → 进入卡片学习页 */}
        <button
          onClick={() => navigate(`/flashcard?bookId=${book.id}`)}
          disabled={unfamiliarWords.length === 0 || analyzing}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] font-semibold text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <GraduationCap size={18} />
          先学习词汇
        </button>
        {/* 直接阅读 → 进入阅读界面 */}
        <button
          onClick={() => navigate(`/reading?bookId=${book.id}`)}
          disabled={analyzing}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-[var(--color-background-secondary)] text-[var(--color-foreground)] rounded-[var(--radius-sm)] font-semibold text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <BookOpen size={18} />
          直接阅读
        </button>
      </div>
    </div>
  )
}
