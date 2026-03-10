import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Star, Sparkles, ChevronRight, Trophy, Volume2,
  X, Loader2, BookOpen, Lightbulb,
} from 'lucide-react'
import { getWordDetail, type WordDetail } from '../services/gemini'
import { useVocabulary, type VocabFilter } from '../hooks/useVocabulary'
import { speakEnglish } from '../lib/tts'

/**
 * 词库页 —— 接入 Supabase + AI
 *
 * 数据来源：
 * - 词汇列表从 user_vocabulary 表读取（通过 useVocabulary hook）
 * - 如果数据库不可用，显示空列表提示
 * - 搜索/详情仍用 AI（getWordDetail）
 * - 收藏 toggle 直接写入数据库
 */

const filters = ['全部', '收藏', 'AI 分类'] as const
const filterMap: Record<string, VocabFilter> = {
  '全部': 'all',
  '收藏': 'starred',
  'AI 分类': 'ai_classify',
}

export default function VocabPage() {
  const navigate = useNavigate()

  // ===== Supabase 词汇数据 =====
  const { vocabulary, loading: vocabLoading, fetchVocabulary, toggleStar } = useVocabulary()

  // ===== 本地 UI 状态 =====
  const [activeFilter, setActiveFilter] = useState('全部')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedWord, setSelectedWord] = useState<WordDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<WordDetail | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // 首次加载 + 筛选变化时刷新数据
  useEffect(() => {
    fetchVocabulary(filterMap[activeFilter] || 'all')
  }, [activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 搜索单词（回车触发 AI）=====
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    setSearchResult(null)
    setDetailError(null)
    try {
      const detail = await getWordDetail(searchQuery.trim())
      setSearchResult(detail)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '搜索失败')
    } finally {
      setIsSearching(false)
    }
  }

  // ===== 点击列表中的单词 → AI 详情 =====
  const handleWordClick = async (word: string) => {
    setIsLoadingDetail(true)
    setSelectedWord(null)
    setDetailError(null)
    try {
      const detail = await getWordDetail(word)
      setSelectedWord(detail)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : '获取详情失败')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const closeDetail = () => {
    setSelectedWord(null)
    setDetailError(null)
  }

  // 本地搜索过滤（在已获取的数据库数据上二次过滤）
  const filteredList = vocabulary.filter(item => {
    if (searchQuery && !item.word.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-full relative">
      {/* ===== Header ===== */}
      <div className="px-5 py-4">
        <h1 className="text-[20px] font-bold text-[var(--color-foreground)] font-secondary">词库</h1>
        <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
          AI 智能释义 · {vocabulary.length} 个词汇
        </p>
      </div>

      {/* ===== 搜索框 ===== */}
      <div className="px-5 mb-3">
        <div className="flex items-center gap-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)] px-4 py-2.5">
          <Search size={18} className="text-[var(--color-muted)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder="搜索单词（回车查询 AI 释义）..."
            className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
          />
          {isSearching && <Loader2 size={16} className="text-[var(--color-primary)] animate-spin shrink-0" />}
          {searchQuery && !isSearching && (
            <button onClick={() => { setSearchQuery(''); setSearchResult(null) }}>
              <X size={16} className="text-[var(--color-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* ===== AI 搜索结果 ===== */}
      {searchResult && (
        <div className="mx-5 mb-3 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] border border-[var(--color-primary)]/20" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[var(--color-primary)]" />
              <span className="text-[12px] text-[var(--color-primary)] font-semibold">AI 智能释义</span>
            </div>
            <button onClick={() => setSearchResult(null)}>
              <X size={14} className="text-[var(--color-muted)]" />
            </button>
          </div>
          <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">
            {searchResult.word}
            <span className="text-[12px] font-normal text-[var(--color-muted)] ml-2">{searchResult.phonetic}</span>
          </h3>
          <p className="text-[14px] text-[var(--color-foreground)] mt-1">{searchResult.meaning}</p>
          {searchResult.examples.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] text-[var(--color-muted)] mb-1 flex items-center gap-1">
                <BookOpen size={12} /> 例句
              </p>
              {searchResult.examples.map((ex, i) => (
                <p key={i} className="text-[13px] text-[var(--color-foreground)] leading-relaxed pl-3 border-l-2 border-[var(--color-primary)]/30 mb-1.5">
                  {ex}
                </p>
              ))}
            </div>
          )}
          {searchResult.mnemonic && (
            <div className="mt-3 p-2.5 bg-[var(--color-primary-light)] rounded-[var(--radius-xs)] flex items-start gap-2">
              <Lightbulb size={14} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
              <p className="text-[12px] text-[var(--color-foreground)] leading-relaxed">{searchResult.mnemonic}</p>
            </div>
          )}
          {searchResult.synonyms.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-[var(--color-muted)]">同义词:</span>
              {searchResult.synonyms.map((s, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 bg-[var(--color-background-secondary)] rounded-full text-[var(--color-foreground)]">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== 筛选标签 ===== */}
      <div className="flex items-center gap-2 px-5 mb-4">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => {
              if (f === 'AI 分类') {
                navigate('/ai-classify')
              } else {
                setActiveFilter(f)
              }
            }}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              activeFilter === f
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-background-secondary)] text-[var(--color-muted)]'
            }`}
          >
            {f === 'AI 分类' && <Sparkles size={12} className="inline mr-1" />}
            {f}
          </button>
        ))}
      </div>

      {/* ===== 词汇量测试入口 ===== */}
      <div
        className="mx-5 mb-4 p-4 rounded-[var(--radius-md)] bg-[var(--color-primary-light)] flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform"
        style={{ boxShadow: 'var(--shadow-card)' }}
        onClick={() => navigate('/vocab-test')}
      >
        <div className="w-11 h-11 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
          <Trophy size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">词汇量测试</p>
          <p className="text-[12px] text-[var(--color-muted)]">
            当前词库 {vocabulary.length} 词
          </p>
        </div>
        <ChevronRight size={18} className="text-[var(--color-muted)] shrink-0" />
      </div>

      {/* ===== 词汇列表 ===== */}
      <div className="flex-1 overflow-y-auto px-5">
        {/* 加载中 */}
        {vocabLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="text-[var(--color-primary)] animate-spin" />
          </div>
        )}

        {/* 空状态 */}
        {!vocabLoading && filteredList.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[14px] text-[var(--color-muted)]">
              {searchQuery ? '没有找到匹配的词汇' : '词库为空，去翻译页收录一些词汇吧'}
            </p>
          </div>
        )}

        {/* 词汇卡片 */}
        {!vocabLoading && filteredList.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 py-3.5 border-b border-[var(--color-border)] cursor-pointer active:bg-[var(--color-background-secondary)]/50 transition-colors"
            onClick={() => handleWordClick(item.word)}
          >
            {/* 熟练度指示条 */}
            <div className="w-1 h-10 rounded-full" style={{
              backgroundColor:
                item.mastery_level >= 4 ? '#22C55E' :
                item.mastery_level >= 2 ? '#FFB366' :
                '#EF4444'
            }} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-[var(--color-foreground)]">{item.word}</span>
                <span className="text-[11px] text-[var(--color-muted)]">{item.phonetic || ''}</span>
              </div>
              <p className="text-[12px] text-[var(--color-muted)] mt-0.5 truncate">{item.meaning || ''}</p>
            </div>

            {/* 发音按钮 */}
            <button className="p-1" onClick={(e) => { e.stopPropagation(); speakEnglish(item.word) }}>
              <Volume2 size={16} className="text-[var(--color-muted)]" />
            </button>

            {/* 收藏按钮 */}
            <button className="p-1" onClick={(e) => { e.stopPropagation(); toggleStar(item.id) }}>
              <Star size={16} className={item.starred ? 'text-[var(--color-primary)] fill-[var(--color-primary)]' : 'text-[var(--color-border-dark)]'} />
            </button>
          </div>
        ))}
      </div>

      {/* ===== 单词详情弹窗 ===== */}
      {(selectedWord || isLoadingDetail) && (
        <div className="absolute inset-0 bg-black/40 flex items-end z-50" onClick={closeDetail}>
          <div className="w-full bg-white rounded-t-[24px] px-5 pt-5 pb-8 max-h-[70%] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {isLoadingDetail && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={28} className="text-[var(--color-primary)] animate-spin mb-3" />
                <p className="text-[13px] text-[var(--color-muted)]">AI 正在分析单词...</p>
              </div>
            )}

            {detailError && !isLoadingDetail && (
              <div className="py-8 text-center">
                <p className="text-[14px] text-[var(--color-error)]">{detailError}</p>
                <button onClick={closeDetail} className="mt-3 text-[13px] text-[var(--color-primary)]">关闭</button>
              </div>
            )}

            {selectedWord && !isLoadingDetail && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[var(--color-primary)]" />
                    <span className="text-[13px] text-[var(--color-primary)] font-semibold">AI 深度解析</span>
                  </div>
                  <button onClick={closeDetail}>
                    <X size={18} className="text-[var(--color-muted)]" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-[24px] font-bold text-[var(--color-foreground)]">{selectedWord.word}</h2>
                  <button onClick={() => speakEnglish(selectedWord.word)}>
                    <Volume2 size={18} className="text-[var(--color-primary)]" />
                  </button>
                </div>
                <p className="text-[13px] text-[var(--color-muted)] mb-1">{selectedWord.phonetic}</p>
                <p className="text-[15px] text-[var(--color-foreground)] mb-4">{selectedWord.meaning}</p>

                <div className="mb-4">
                  <h4 className="text-[13px] font-semibold text-[var(--color-foreground)] mb-2 flex items-center gap-1.5">
                    <BookOpen size={14} className="text-[var(--color-info)]" /> 例句
                  </h4>
                  {selectedWord.examples.map((ex, i) => (
                    <p key={i} className="text-[13px] text-[var(--color-foreground)] leading-relaxed pl-3 border-l-2 border-[var(--color-info)]/30 mb-2">
                      {ex}
                    </p>
                  ))}
                </div>

                <div className="mb-4 p-3 bg-[var(--color-primary-light)] rounded-[var(--radius-sm)]">
                  <h4 className="text-[13px] font-semibold text-[var(--color-foreground)] mb-1 flex items-center gap-1.5">
                    <Lightbulb size={14} className="text-[var(--color-primary)]" /> 记忆技巧
                  </h4>
                  <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed">{selectedWord.mnemonic}</p>
                </div>

                {selectedWord.synonyms.length > 0 && (
                  <div>
                    <h4 className="text-[13px] font-semibold text-[var(--color-foreground)] mb-2">同义词</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedWord.synonyms.map((s, i) => (
                        <span key={i} className="px-3 py-1 bg-[var(--color-background-secondary)] rounded-full text-[12px] text-[var(--color-foreground)]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
