import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Settings, Volume2, X, Check, Loader2 } from 'lucide-react'
import { speakEnglish } from '../lib/tts'
import { useVocabulary } from '../hooks/useVocabulary'
import { supabase, type UserBook } from '../lib/supabase'
import { analyzeUnfamiliarWords } from '../services/gemini'
import { SAMPLE_BOOKS } from '../data/sampleBooks'

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
  const [searchParams] = useSearchParams()
  const bookId = searchParams.get('bookId')
  const { addWord } = useVocabulary()

  // ===== 书籍 & 文本状态 =====
  const [book, setBook] = useState<UserBook | null>(null)
  const [loading, setLoading] = useState(true)
  const [paragraphs, setParagraphs] = useState<string[]>([])

  // ===== 陌生词汇（AI 分析结果） =====
  const [vocabMap, setVocabMap] = useState<Record<string, { meaning: string; phonetic: string }>>({})

  // ===== UI 状态 =====
  const [autoTranslate, setAutoTranslate] = useState(true)
  const [autoCollect, setAutoCollect] = useState(true)
  const [selectedWord, setSelectedWord] = useState<WordPopup | null>(null)
  const [learnedWords, setLearnedWords] = useState<Set<string>>(new Set())

  // ===== 加载书籍 =====
  useEffect(() => {
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

      // 支持示例书籍（负数 ID）：不查数据库，直接读取本地演示数据
      if (parsedId < 0) {
        const sampleBook = SAMPLE_BOOKS.find((b) => b.id === parsedId) || null
        if (sampleBook) {
          setBook(sampleBook)
          if (sampleBook.content_text) {
            const paras = sampleBook.content_text
              .split(/\n\n+/)
              .map((p: string) => p.trim())
              .filter((p: string) => p.length > 0)
            setParagraphs(paras)

            try {
              const words = await analyzeUnfamiliarWords(sampleBook.content_text, 20)
              const map: Record<string, { meaning: string; phonetic: string }> = {}
              words.forEach(w => {
                map[w.word.toLowerCase()] = { meaning: w.meaning, phonetic: w.phonetic || '' }
              })
              setVocabMap(map)
            } catch {
              // AI 分析失败，不影响阅读
            }
          }
        }
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('user_books')
        .select('*')
        .eq('id', parsedId)
        .single()

      if (!error && data) {
        setBook(data)

        // 将文本按段落分割
        if (data.content_text) {
          const paras = data.content_text
            .split(/\n\n+/)
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0)
          setParagraphs(paras)

          // AI 分析陌生词汇
          try {
            const words = await analyzeUnfamiliarWords(data.content_text, 20)
            const map: Record<string, { meaning: string; phonetic: string }> = {}
            words.forEach(w => {
              map[w.word.toLowerCase()] = { meaning: w.meaning, phonetic: w.phonetic || '' }
            })
            setVocabMap(map)
          } catch {
            // AI 分析失败，不影响阅读
          }
        }
      }
      setLoading(false)
    }

    loadBook()
  }, [bookId])

  // ===== 渲染段落文本（高亮陌生词汇） =====
  const vocabKeys = useMemo(() => Object.keys(vocabMap), [vocabMap])
  const vocabPattern = useMemo(
    () => vocabKeys.length > 0 ? new RegExp(`\\b(${vocabKeys.join('|')})\\b`, 'gi') : null,
    [vocabKeys]
  )

  const renderParagraph = (text: string) => {
    if (!vocabPattern) {
      return <span>{text}</span>
    }

    const parts = text.split(vocabPattern)
    return parts.map((part, i) => {
      const vocabEntry = vocabMap[part.toLowerCase()]
      if (vocabEntry) {
        const isLearned = learnedWords.has(part.toLowerCase())
        return (
          <span key={i}>
            <span
              className={`cursor-pointer transition-colors ${
                selectedWord?.word.toLowerCase() === part.toLowerCase()
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
      setLearnedWords(prev => new Set([...prev, selectedWord.word.toLowerCase()]))
      setSelectedWord(null)
    }
  }

  // ===== 加载中 =====
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <Loader2 size={32} className="text-[var(--color-primary)] animate-spin" />
      </div>
    )
  }

  // ===== 无书籍 =====
  if (!book) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center px-8">
        <p className="text-[16px] text-[var(--color-foreground)] font-semibold mb-4">未找到书籍</p>
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
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <div className="text-center flex-1 min-w-0 px-2">
          <h1 className="text-[16px] font-bold text-[var(--color-foreground)] font-secondary line-clamp-1">
            {book.title}
          </h1>
          <p className="text-[11px] text-[var(--color-muted)]">{book.author}</p>
        </div>
        <button className="p-1">
          <Settings size={20} className="text-[var(--color-muted)]" />
        </button>
      </div>

      {/* ===== 文章内容 ===== */}
      <div className="flex-1 px-5 py-6 overflow-y-auto">
        {paragraphs.length > 0 ? (
          paragraphs.map((para, i) => (
            <p key={i} className="text-[15px] text-[var(--color-foreground)] leading-[1.8] mb-4 font-primary">
              {renderParagraph(para)}
            </p>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-[14px] text-[var(--color-muted)]">该书籍暂无可显示的文本内容</p>
          </div>
        )}
      </div>

      {/* ===== 单词详情弹窗 ===== */}
      {selectedWord && (
        <div
          className="mx-5 mb-3 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] border border-[var(--color-primary)]/20"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
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
              className="p-2 rounded-full bg-[var(--color-background-secondary)]"
              onClick={() => speakEnglish(selectedWord.word)}
            >
              <Volume2 size={16} className="text-[var(--color-muted)]" />
            </button>
            <button
              onClick={() => {
                handleMarkLearned()
                if (autoCollect && selectedWord) {
                  addWord({
                    word: selectedWord.word,
                    phonetic: selectedWord.phonetic,
                    meaning: selectedWord.meaning,
                    source: 'reading',
                  }).catch(() => {})
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-xs)] text-[13px] font-semibold active:scale-[0.98] transition-transform"
            >
              <Check size={14} /> 我会了
            </button>
          </div>
        </div>
      )}

      {/* ===== 底部设置栏 ===== */}
      <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between bg-[var(--color-card)]">
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
          <span className="text-[12px] text-[var(--color-foreground)]">自动收录词汇</span>
        </label>
      </div>
    </div>
  )
}
