import { useState, useEffect, useRef, type WheelEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Star, Sparkles, ChevronRight, Trophy, Volume2, BadgeCheck,
  X, Loader2, BookOpen, Lightbulb, Trash2, Plus, FolderOpen, ArrowDownAZ, Clock3,
} from 'lucide-react'
import { getWordDetail, type WordDetail } from '../services/gemini'
import { useVocabulary, type VocabFilter } from '../hooks/useVocabulary'
import { speakAuto } from '../lib/tts'
import { t, tf, useAppLanguage } from '../lib/i18n'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  isCjkText,
  matchesSearchText,
  normalizeLookupKey,
  normalizeVocabWord,
  shouldShowPhonetic,
} from '../lib/text'
import { getIntervalLabel, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'

/**
 * 词库页 —— 接入 Supabase + AI
 *
 * 数据来源：
 * - 词汇列表从 user_vocabulary 表读取（通过 useVocabulary hook）
 * - 如果数据库不可用，显示空列表提示
 * - 搜索/详情仍用 AI（getWordDetail）
 * - 收藏 toggle 直接写入数据库
 */

const filterOptions: Array<{ key: 'vocab_filter_new' | 'vocab_filter_mastered' | 'vocab_filter_ai' | 'vocab_filter_starred'; value: VocabFilter }> = [
  { key: 'vocab_filter_new', value: 'new' },
  { key: 'vocab_filter_mastered', value: 'mastered' },
  { key: 'vocab_filter_ai', value: 'ai_classify' },
  { key: 'vocab_filter_starred', value: 'starred' },
]

function buildLocalWordDetail(item: {
  word: string
  phonetic?: string | null
  meaning?: string | null
  example_sentence?: string | null
}): WordDetail {
  return {
    word: item.word,
    phonetic: item.phonetic || '',
    meaning: item.meaning || '暂无释义',
    examples: item.example_sentence ? [item.example_sentence] : [],
    synonyms: [],
    mnemonic: isCjkText(item.word)
      ? '该词条来自翻译收藏，当前先展示本地保存的释义与例句。'
      : '该词条当前使用本地兜底详情。',
  }
}

export default function VocabPage() {
  const navigate = useNavigate()
  const lang = useAppLanguage()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { user } = useAuth()

  // ===== Supabase 词汇数据 =====
  const { vocabulary, loading: vocabLoading, fetchVocabulary, addWords, toggleStar, deleteWord } = useVocabulary()

  // ===== 本地 UI 状态 =====
  const [activeFilter, setActiveFilter] = useState<VocabFilter>('new')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedWord, setSelectedWord] = useState<WordDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<WordDetail | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [swipedId, setSwipedId] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [setSortMode, setSetSortMode] = useState<'time' | 'name'>(() => {
    const saved = localStorage.getItem('linswift_vocab_set_sort')
    return saved === 'name' ? 'name' : 'time'
  })
  const [setPanelLoading, setSetPanelLoading] = useState(false)
  const [customSetError, setCustomSetError] = useState<string | null>(null)
  const [customSets, setCustomSets] = useState<Array<{
    id: number
    name: string
    created_at: string
    count: number
  }>>([])
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null)
  const [isSetModalOpen, setIsSetModalOpen] = useState(false)
  const [setNameInput, setSetNameInput] = useState('')
  const [batchWordsInput, setBatchWordsInput] = useState('')
  const [setWords, setSetWords] = useState<Array<{ id: number; word: string; phonetic: string | null }>>([])
  const [setActionLoading, setSetActionLoading] = useState(false)
  const folderScrollRef = useRef<HTMLDivElement | null>(null)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchIntentRef = useRef<'none' | 'horizontal' | 'vertical'>('none')
  const touchingIdRef = useRef<number | null>(null)
  const SWIPE_ACTION_WIDTH = 84
  const SWIPE_OPEN_THRESHOLD = 42
  const SWIPE_START_THRESHOLD = 12

  // 首次加载 + 筛选变化时刷新数据
  useEffect(() => {
    fetchVocabulary(activeFilter)
  }, [activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSwipedId(null)
    setSwipeOffset(0)
  }, [activeFilter, searchQuery, isDesktop])

  const sortSets = (rows: Array<{ id: number; name: string; created_at: string; count: number }>, mode: 'time' | 'name') => {
    const copy = [...rows]
    if (mode === 'name') {
      copy.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    } else {
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return copy
  }

  const describeSetError = (message: string) => {
    if (message.includes('user_vocab_sets') || message.includes('user_vocab_set_words') || message.includes('schema cache')) {
      return '学习集数据库未初始化，请先执行 supabase-migration-v8.sql'
    }
    return message
  }

  const loadCustomSets = async (mode: 'time' | 'name' = setSortMode) => {
    if (!user) return
    setSetPanelLoading(true)
    setCustomSetError(null)
    const [setsRes, mappingRes] = await Promise.all([
      supabase
        .from('user_vocab_sets')
        .select('id,name,created_at')
        .eq('user_id', user.id),
      supabase
        .from('user_vocab_set_words')
        .select('set_id')
        .eq('user_id', user.id),
    ])

    if (setsRes.error || mappingRes.error) {
      const msg = describeSetError(setsRes.error?.message || mappingRes.error?.message || '学习集加载失败')
      setCustomSetError(msg)
      setSetPanelLoading(false)
      return
    }

    const countMap = new Map<number, number>()
    ;(mappingRes.data || []).forEach((row: any) => {
      const sid = Number(row.set_id)
      countMap.set(sid, (countMap.get(sid) || 0) + 1)
    })

    const rows = (setsRes.data || []).map((row: any) => ({
      id: Number(row.id),
      name: row.name || '未命名学习集',
      created_at: row.created_at,
      count: countMap.get(Number(row.id)) || 0,
    }))

    const sorted = sortSets(rows, mode)
    setCustomSets(sorted)
    if (sorted.length > 0 && !sorted.some(s => s.id === selectedSetId)) {
      setSelectedSetId(sorted[0].id)
    }
    if (sorted.length === 0) setSelectedSetId(null)
    setSetPanelLoading(false)
  }

  useEffect(() => {
    loadCustomSets(setSortMode)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCustomSets(prev => sortSets(prev, setSortMode))
    localStorage.setItem('linswift_vocab_set_sort', setSortMode)
  }, [setSortMode])

  // ===== 搜索单词（回车触发 AI）=====
  const handleSearch = async () => {
    const query = searchQuery.trim()
    if (!query) return
    setIsSearching(true)
    setSearchResult(null)
    setDetailError(null)
    try {
      const localExact = vocabulary.find(item => normalizeLookupKey(item.word) === normalizeLookupKey(query))
      const localPartial = localExact || vocabulary.find(item => matchesSearchText(item.word, query))

      if (isCjkText(query) || (localPartial && isCjkText(localPartial.word))) {
        if (localPartial) {
          setSearchResult(buildLocalWordDetail(localPartial))
        } else {
          setSearchResult(buildLocalWordDetail({
            word: query,
            meaning: '该中文词条暂未收藏到词库，可先在翻译页或阅读页收录后再查看。',
            example_sentence: '提示：收藏后会保留原文与释义，便于后续复习。',
          }))
        }
        return
      }

      const detail = await getWordDetail(query)
      setSearchResult(detail)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : t(lang, 'common_search_failed'))
    } finally {
      setIsSearching(false)
    }
  }

  // ===== 点击列表中的单词 → AI 详情 =====
  const handleWordClick = async (item: { word: string; phonetic?: string | null; meaning?: string | null; example_sentence?: string | null }) => {
    if (isCjkText(item.word)) {
      setSelectedWord(buildLocalWordDetail(item))
      setDetailError(null)
      return
    }

    setIsLoadingDetail(true)
    setSelectedWord(null)
    setDetailError(null)
    try {
      const detail = await getWordDetail(item.word)
      setSelectedWord(detail)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : t(lang, 'common_fetch_failed'))
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const closeDetail = () => {
    setSelectedWord(null)
    setDetailError(null)
  }

  const handleDeleteWord = async (id: number, word: string) => {
    const ok = window.confirm(tf(lang, 'vocab_delete_confirm', { word }))
    if (!ok) return
    await deleteWord(id)
    if (swipedId === id) {
      setSwipedId(null)
      setSwipeOffset(0)
    }
  }

  const handleMasteryClick = (item: {
    word: string
    mastery_level: number
    next_review_at: string | null
    review_count?: number | null
  }) => {
    const cycle = getReviewCycleDaysFromLocalStorage()
    if (item.mastery_level >= 5) {
      window.alert(`“${item.word}” 已完成完整艾宾浩斯${cycle}天周期，当前属于已掌握词。`)
      return
    }

    const nextReviewLabel = item.next_review_at
      ? new Date(item.next_review_at).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '待安排'

    const stageLabel = getIntervalLabel(item.mastery_level ?? 0, cycle)
    const reviewCount = Number(item.review_count || 0)

    window.alert(
      `“${item.word}” 还没有完成完整艾宾浩斯${cycle}天周期。\n\n当前阶段：${stageLabel}\n累计复习：${reviewCount} 次\n下次复习：${nextReviewLabel}\n\n要进入“已掌握”，必须按计划完成整个复习周期，不能在词库里手动跳过。`
    )
  }

  const handleTouchStart = (id: number, x: number, y: number) => {
    touchStartXRef.current = x
    touchStartYRef.current = y
    touchIntentRef.current = 'none'
    touchingIdRef.current = id
  }

  const handleTouchMove = (x: number, y: number) => {
    if (touchingIdRef.current === null) return
    const deltaX = x - touchStartXRef.current
    const deltaY = y - touchStartYRef.current

    if (touchIntentRef.current === 'none') {
      if (Math.abs(deltaX) < SWIPE_START_THRESHOLD && Math.abs(deltaY) < SWIPE_START_THRESHOLD) return
      touchIntentRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }

    if (touchIntentRef.current !== 'horizontal') return

    // 改为从左往右滑动，显示左侧删除操作
    const next = Math.max(0, Math.min(SWIPE_ACTION_WIDTH, deltaX))
    if (swipedId !== touchingIdRef.current) {
      setSwipedId(touchingIdRef.current)
    }
    setSwipeOffset(next)
  }

  const handleTouchEnd = () => {
    if (touchingIdRef.current === null) return
    const shouldOpen = swipeOffset > SWIPE_OPEN_THRESHOLD
    setSwipeOffset(shouldOpen ? SWIPE_ACTION_WIDTH : 0)
    if (!shouldOpen) setSwipedId(null)
    touchingIdRef.current = null
    touchIntentRef.current = 'none'
  }

  const parseWordsInput = (raw: string) => {
    const chunks = raw
      .split(/[\s,，;；、|]+/)
      .map(item => normalizeVocabWord(item))
      .filter(Boolean)

    const unique = Array.from(new Set(chunks))
    return unique.slice(0, 300)
  }

  const handleCreateSet = async () => {
    if (!user) return
    const name = window.prompt('请输入学习集名称')
    if (!name?.trim()) return
    setSetActionLoading(true)
    setCustomSetError(null)
    const { error } = await supabase.from('user_vocab_sets').insert({
      user_id: user.id,
      name: name.trim(),
    })
    setSetActionLoading(false)
    if (error) {
      const msg = describeSetError(error.message)
      setCustomSetError(msg)
      window.alert(msg)
      return
    }
    await loadCustomSets(setSortMode)
  }

  const loadSetWords = async (setId: number) => {
    const { data, error } = await supabase
      .from('user_vocab_set_words')
      .select('id,vocabulary_id,user_vocabulary(word,phonetic)')
      .eq('set_id', setId)
      .order('created_at', { ascending: false })

    if (error) {
      setCustomSetError(describeSetError(error.message))
      setSetWords([])
      return
    }

    const rows = (data || []).map((row: any) => ({
      id: Number(row.vocabulary_id),
      word: row.user_vocabulary?.word || '',
      phonetic: row.user_vocabulary?.phonetic || null,
    })).filter(item => item.word)

    setSetWords(rows)
  }

  const handleOpenSetModal = async (setId: number) => {
    const target = customSets.find(s => s.id === setId)
    if (!target) return
    setSelectedSetId(setId)
    setSetNameInput(target.name)
    setBatchWordsInput('')
    setIsSetModalOpen(true)
    await loadSetWords(setId)
  }

  const handleRenameSet = async () => {
    if (!selectedSetId || !setNameInput.trim()) return
    setSetActionLoading(true)
    setCustomSetError(null)
    const { error } = await supabase
      .from('user_vocab_sets')
      .update({ name: setNameInput.trim() })
      .eq('id', selectedSetId)
    setSetActionLoading(false)
    if (error) {
      const msg = describeSetError(error.message)
      setCustomSetError(msg)
      window.alert(msg)
      return
    }
    await loadCustomSets(setSortMode)
  }

  const handleBatchAddToSet = async () => {
    if (!user || !selectedSetId) return
    const words = parseWordsInput(batchWordsInput)
    if (words.length === 0) {
      window.alert('请输入要添加的单词（支持空格/逗号/换行分隔）')
      return
    }
    setSetActionLoading(true)
    setCustomSetError(null)
    await addWords(words.map(word => ({ word, source: 'manual' })))
    const { data: vocabRows, error: vocabErr } = await supabase
      .from('user_vocabulary')
      .select('id,word')
      .eq('user_id', user.id)
      .in('word', words)

    if (vocabErr) {
      const msg = describeSetError(vocabErr.message)
      setCustomSetError(msg)
      setSetActionLoading(false)
      window.alert(msg)
      return
    }

    if (vocabRows?.length) {
      const rows = vocabRows.map((row: any) => ({
        set_id: selectedSetId,
        user_id: user.id,
        vocabulary_id: row.id,
      }))
      const { error } = await supabase
        .from('user_vocab_set_words')
        .upsert(rows, { onConflict: 'set_id,vocabulary_id' })
      if (error) {
        const msg = describeSetError(error.message)
        setCustomSetError(msg)
        setSetActionLoading(false)
        window.alert(msg)
        return
      }
    }

    setSetActionLoading(false)
    setBatchWordsInput('')
    await Promise.all([loadSetWords(selectedSetId), loadCustomSets(setSortMode)])
    fetchVocabulary(activeFilter)
  }

  const handleFolderWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!isDesktop || !folderScrollRef.current) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault()
      folderScrollRef.current.scrollLeft += e.deltaY
    }
  }

  // 本地搜索过滤（在已获取的数据库数据上二次过滤）
  const filteredList = vocabulary.filter(item => {
    if (searchQuery && !matchesSearchText(item.word, searchQuery) && !matchesSearchText(item.meaning, searchQuery)) {
      return false
    }
    return true
  })

  const glassPanel = 'glass-card-strong'
  const glassSoft = 'glass-card-soft'
  const glassElevated = 'glass-card-elevated'
  const listItemShell = 'glass-list-item'
  const selectedSet = customSets.find(set => set.id === selectedSetId) || null

  if (isDesktop) {
    return (
      <div className="relative -mx-6 -my-4 min-h-full overflow-hidden bg-white px-6 py-5">
        <div className="relative z-10 flex min-h-full flex-col gap-5">
          <section className={`${glassPanel} rounded-[32px] p-6`}>
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
              <div className="max-w-[680px]">
                <div className="mb-3 flex items-center gap-3 text-[var(--color-primary)]">
                  <div className={`${glassElevated} flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--color-primary)]`}>
                    <Sparkles size={18} />
                  </div>
                  <span className="text-[12px] font-semibold uppercase tracking-[0.2em]">Glass Vocabulary</span>
                </div>
                <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-foreground)]">{t(lang, 'vocab_title')}</h1>
                <p className="mt-2 text-[14px] leading-6 text-[var(--color-muted)]">
                  把搜索、学习集、AI 释义和复习操作收进同一张桌面玻璃工作台里，不再拆成彼此竞争的几个大区块。
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 2xl:min-w-[380px]">
                <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Vocabulary</p>
                  <p className="mt-2 text-[28px] font-bold text-[var(--color-foreground)]">{vocabulary.length}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-muted)]">{tf(lang, 'vocab_current_count', { count: vocabulary.length })}</p>
                </div>
                <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Filtered</p>
                  <p className="mt-2 text-[28px] font-bold text-[var(--color-foreground)]">{filteredList.length}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-muted)]">{t(lang, filterOptions.find(option => option.value === activeFilter)?.key || 'vocab_filter_new')}</p>
                </div>
                <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Workspace</p>
                  <p className="mt-2 line-clamp-2 text-[15px] font-semibold text-[var(--color-foreground)]">{user?.email || 'Linswift'}</p>
                  <p className="mt-2 text-[12px] text-[var(--color-muted)]">与全局背景同步的词汇工作台</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center">
              <div className={`${glassElevated} flex min-w-0 flex-1 items-center gap-3 rounded-[24px] px-5 py-3.5`}>
                <Search size={18} className="shrink-0 text-[var(--color-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  placeholder={t(lang, 'vocab_search_placeholder')}
                  className="flex-1 bg-transparent text-[15px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
                />
                {isSearching && <Loader2 size={16} className="shrink-0 animate-spin text-[var(--color-primary)]" />}
                {searchQuery && !isSearching && (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResult(null) }}
                    className="rounded-full p-1 text-[var(--color-muted)] transition-colors hover:bg-white/45 hover:text-[var(--color-foreground)]"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setActiveFilter(option.value)}
                    className={`rounded-full px-4 py-2 text-[13px] font-medium transition-all ${
                      activeFilter === option.value
                        ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_28px_rgba(255,132,0,0.24)]'
                        : `${glassElevated} text-[var(--color-foreground)] hover:bg-white/70`
                    }`}
                  >
                    {t(lang, option.key)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={`${glassPanel} min-h-0 flex-1 rounded-[34px] p-4`}>
            <div className="grid min-h-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:h-full 2xl:grid-cols-[280px_minmax(0,1fr)_340px]">
              <div className={`${glassElevated} flex min-h-0 flex-col rounded-[28px] p-4 xl:row-span-2 2xl:row-span-1`}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[18px] font-semibold text-[var(--color-foreground)]">自定义学习集</h3>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">把词组装进自己的复习路径，左侧只保留一个持续工作的文件夹区。</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className={`rounded-full px-3 py-1.5 text-[12px] ${setSortMode === 'time' ? 'bg-[var(--color-primary)] text-white' : `${glassSoft} text-[var(--color-foreground)]`}`}
                      onClick={() => setSetSortMode('time')}
                    >
                      <span className="inline-flex items-center gap-1"><Clock3 size={12} /> 时间</span>
                    </button>
                    <button
                      className={`rounded-full px-3 py-1.5 text-[12px] ${setSortMode === 'name' ? 'bg-[var(--color-primary)] text-white' : `${glassSoft} text-[var(--color-foreground)]`}`}
                      onClick={() => setSetSortMode('name')}
                    >
                      <span className="inline-flex items-center gap-1"><ArrowDownAZ size={12} /> 命名</span>
                    </button>
                  </div>
                </div>

                {customSetError && (
                  <div className="mb-4 rounded-[22px] border border-red-200 bg-red-50/70 px-4 py-3 text-[12px] text-red-600">
                    {customSetError}
                  </div>
                )}

                <button
                  className={`${glassSoft} mb-4 flex items-center justify-between rounded-[24px] border border-dashed border-[var(--color-primary)]/35 px-4 py-4 text-left transition-transform hover:-translate-y-0.5`}
                  onClick={handleCreateSet}
                  disabled={setActionLoading}
                >
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--color-foreground)]">新增学习集</p>
                    <p className="mt-1 text-[12px] text-[var(--color-muted)]">快速创建一个新的词汇文件夹</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white shadow-[0_12px_28px_rgba(255,132,0,0.22)]">
                    <Plus size={18} />
                  </div>
                </button>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {setPanelLoading && (
                    <div className={`${glassSoft} flex h-[120px] items-center justify-center rounded-[22px] text-[13px] text-[var(--color-muted)]`}>
                      读取中...
                    </div>
                  )}

                  {!setPanelLoading && customSets.length === 0 && (
                    <div className={`${glassSoft} rounded-[22px] px-4 py-5 text-[13px] leading-6 text-[var(--color-muted)]`}>
                      还没有自定义学习集。先建一个，再把一批新词拖进自己的复习轨道。
                    </div>
                  )}

                  <div className="space-y-3">
                    {!setPanelLoading && customSets.map((setItem) => (
                      <button
                        key={setItem.id}
                        className={`w-full rounded-[22px] border px-4 py-4 text-left transition-all ${
                          selectedSetId === setItem.id
                            ? 'border-[var(--color-primary)]/35 bg-[linear-gradient(180deg,rgba(255,132,0,0.16),rgba(255,255,255,0.68))] text-[var(--color-foreground)] shadow-[0_18px_34px_rgba(255,132,0,0.14)]'
                            : `${glassSoft} border-white/40 text-[var(--color-foreground)] hover:bg-white/72`
                        }`}
                        onClick={() => handleOpenSetModal(setItem.id)}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FolderOpen size={15} className={selectedSetId === setItem.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'} />
                            <span className="truncate text-[14px] font-semibold">{setItem.name}</span>
                          </div>
                          <ChevronRight size={15} className={selectedSetId === setItem.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'} />
                        </div>
                        <div className="flex items-center justify-between text-[12px]">
                          <span className={selectedSetId === setItem.id ? 'text-[var(--color-foreground)]/80' : 'text-[var(--color-muted)]'}>{setItem.count} 词</span>
                          <span className={selectedSetId === setItem.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-light)]'}>
                            {new Date(setItem.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className={`${glassSoft} mt-4 rounded-[24px] p-4 text-left transition-transform hover:-translate-y-0.5`}
                  onClick={() => navigate('/vocab-test')}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.2)]">
                      <Trophy size={20} />
                    </div>
                    <ChevronRight size={18} className="text-[var(--color-muted)]" />
                  </div>
                  <p className="text-[17px] font-semibold text-[var(--color-foreground)]">{t(lang, 'vocab_test_title')}</p>
                  <p className="mt-1 text-[13px] leading-6 text-[var(--color-muted)]">{tf(lang, 'vocab_test_count', { count: vocabulary.length })}</p>
                </button>
              </div>

              <div className="flex min-h-0 flex-col gap-4 xl:col-start-2 xl:row-start-1">
                {searchResult && (
                  <div className={`${glassElevated} rounded-[28px] p-5`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[var(--color-primary)]">
                        <Sparkles size={15} />
                        <span className="text-[12px] font-semibold uppercase tracking-[0.16em]">{t(lang, 'vocab_ai_result')}</span>
                      </div>
                      <button onClick={() => setSearchResult(null)} className="rounded-full p-1 text-[var(--color-muted)] transition-colors hover:bg-white/50 hover:text-[var(--color-foreground)]">
                        <X size={15} />
                      </button>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-[24px] font-bold text-[var(--color-foreground)]">
                          {searchResult.word}
                          {shouldShowPhonetic(searchResult.word, searchResult.phonetic) && (
                            <span className="ml-2 text-[13px] font-normal text-[var(--color-muted)]">{searchResult.phonetic}</span>
                          )}
                        </h3>
                        <p className="mt-2 text-[15px] leading-7 text-[var(--color-foreground)]/85">{searchResult.meaning}</p>
                      </div>
                      <button onClick={() => speakAuto(searchResult.word)} className={`${glassSoft} rounded-2xl p-3 text-[var(--color-primary)]`}>
                        <Volume2 size={18} />
                      </button>
                    </div>

                    {searchResult.examples.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {searchResult.examples.slice(0, 4).map((ex, i) => (
                          <p key={i} className={`${glassSoft} rounded-2xl px-4 py-3 text-[13px] leading-6 text-[var(--color-foreground)]/82`}>
                            {ex}
                          </p>
                        ))}
                      </div>
                    )}

                    {searchResult.mnemonic && (
                      <div className="mt-4 rounded-[22px] border border-[var(--color-primary)]/12 bg-[rgba(255,132,0,0.08)] px-4 py-4">
                        <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--color-primary)]">
                          <Lightbulb size={14} /> {t(lang, 'vocab_mnemonic')}
                        </p>
                        <p className="text-[13px] leading-6 text-[var(--color-foreground)]/78">{searchResult.mnemonic}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className={`${glassElevated} min-h-0 flex flex-1 flex-col rounded-[28px] p-5`}>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-[18px] font-semibold text-[var(--color-foreground)]">词汇列表</h3>
                      <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                        当前显示 {filteredList.length} 个词，筛选为 {t(lang, filterOptions.find(option => option.value === activeFilter)?.key || 'vocab_filter_new')}
                      </p>
                    </div>
                    <div className={`${glassSoft} rounded-full px-3 py-1.5 text-[12px] text-[var(--color-muted)]`}>
                      实时同步收藏与掌握状态
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    {vocabLoading && (
                      <div className="flex items-center justify-center py-20">
                        <Loader2 size={28} className="animate-spin text-[var(--color-primary)]" />
                      </div>
                    )}

                    {!vocabLoading && filteredList.length === 0 && (
                      <div className={`${glassSoft} rounded-[24px] px-5 py-10 text-center text-[14px] text-[var(--color-muted)]`}>
                        {searchQuery ? t(lang, 'vocab_no_match') : t(lang, 'vocab_empty')}
                      </div>
                    )}

                    <div className="space-y-3">
                      {!vocabLoading && filteredList.map((item) => (
                        <div
                          key={item.id}
                          className={`${listItemShell} flex w-full items-center gap-4 rounded-[24px] px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:bg-white/78`}
                          onClick={() => handleWordClick(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleWordClick(item)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div
                            className="h-12 w-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                item.mastery_level >= 4 ? '#22C55E' :
                                item.mastery_level >= 2 ? '#FFB366' :
                                '#EF4444'
                            }}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-[17px] font-semibold text-[var(--color-foreground)]">{item.word}</span>
                              {shouldShowPhonetic(item.word, item.phonetic) ? (
                                <span className="truncate text-[12px] text-[var(--color-muted)]">{item.phonetic}</span>
                              ) : item.language_label ? (
                                <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[11px] text-[var(--color-primary)]">{item.language_label}</span>
                              ) : item.source === 'translate' && isCjkText(item.word) ? (
                                <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[11px] text-[var(--color-primary)]">翻译收藏</span>
                              ) : null}
                            </div>
                            <p className="truncate text-[13px] text-[var(--color-foreground)]/72">{item.meaning || ''}</p>
                          </div>

                          <div className="flex items-center gap-1">
                            <button className="rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-white/62 hover:text-[var(--color-foreground)]" onClick={(e) => { e.stopPropagation(); speakAuto(item.word) }}>
                              <Volume2 size={16} />
                            </button>
                            <button className="rounded-full p-2 transition-colors hover:bg-white/62" onClick={(e) => { e.stopPropagation(); toggleStar(item.id) }}>
                              <Star size={16} className={item.starred ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : 'text-[#C6BBB1]'} />
                            </button>
                            <button
                              className="rounded-full p-2 transition-colors hover:bg-white/62"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMasteryClick(item)
                              }}
                              title={item.mastery_level >= 5 ? '查看已掌握状态' : '查看掌握进度'}
                            >
                              <BadgeCheck size={16} className={item.mastery_level >= 5 ? 'text-[#22C55E]' : 'text-[#C6BBB1]'} />
                            </button>
                            <button
                              className="rounded-full p-2 text-[#C06B63] transition-colors hover:bg-white/62 hover:text-[#A53E34]"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteWord(item.id, item.word)
                              }}
                              title={t(lang, 'vocab_delete_title')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${glassElevated} min-h-0 rounded-[28px] p-5 xl:col-start-2 xl:row-start-2 2xl:col-start-3 2xl:row-start-1`}>
                <div className="flex h-full flex-col 2xl:sticky 2xl:top-0">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--color-muted)]">AI Detail</p>
                      <h3 className="mt-1 text-[20px] font-semibold text-[var(--color-foreground)]">词义深挖面板</h3>
                    </div>
                    {(selectedWord || detailError) && (
                      <button onClick={closeDetail} className="rounded-full p-2 text-[var(--color-muted)] transition-colors hover:bg-white/50 hover:text-[var(--color-foreground)]">
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {isLoadingDetail && (
                    <div className="flex flex-1 flex-col items-center justify-center">
                      <Loader2 size={30} className="mb-3 animate-spin text-[var(--color-primary)]" />
                      <p className="text-[13px] text-[var(--color-muted)]">{t(lang, 'vocab_ai_analyzing')}</p>
                    </div>
                  )}

                  {detailError && !isLoadingDetail && (
                    <div className="rounded-[24px] border border-red-200 bg-red-50/70 px-4 py-4 text-[13px] leading-6 text-red-600">
                      <p>{detailError}</p>
                    </div>
                  )}

                  {!selectedWord && !isLoadingDetail && !detailError && (
                    <div className={`${glassSoft} flex flex-1 flex-col justify-between rounded-[24px] p-5`}>
                      <div>
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--color-primary)]/14 text-[var(--color-primary)]">
                          <Sparkles size={24} />
                        </div>
                        <p className="text-[18px] font-semibold text-[var(--color-foreground)]">选一个单词开始</p>
                        <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)]">
                          点击中间列表里的词，右侧会固定展示音标、例句、助记和 AI 解释，不再额外打断页面节奏。
                        </p>
                      </div>

                      <div className="space-y-3 text-[13px] text-[var(--color-foreground)]/78">
                        <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>当前学习集：{selectedSet?.name || '未选择'}</div>
                        <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>搜索词条可直接生成 AI 结果卡片</div>
                      </div>
                    </div>
                  )}

                  {selectedWord && !isLoadingDetail && (
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                      <div className="mb-4 flex items-center gap-2 text-[var(--color-primary)]">
                        <Sparkles size={15} />
                        <span className="text-[12px] font-semibold uppercase tracking-[0.16em]">{t(lang, 'vocab_ai_deep_result')}</span>
                      </div>

                      <div className="mb-2 flex items-center gap-3">
                        <h2 className="text-[28px] font-bold text-[var(--color-foreground)]">{selectedWord.word}</h2>
                        <button onClick={() => speakAuto(selectedWord.word)} className={`${glassSoft} rounded-2xl p-2.5 text-[var(--color-primary)]`}>
                          <Volume2 size={18} />
                        </button>
                      </div>
                      {shouldShowPhonetic(selectedWord.word, selectedWord.phonetic) && (
                        <p className="mb-1 text-[13px] text-[var(--color-muted)]">{selectedWord.phonetic}</p>
                      )}
                      <p className="mb-5 text-[15px] leading-7 text-[var(--color-foreground)]/82">{selectedWord.meaning}</p>

                      <div className="mb-5">
                        <h4 className="mb-3 text-[13px] font-semibold text-[var(--color-foreground)]">例句</h4>
                        <div className="space-y-3">
                          {selectedWord.examples.map((ex, i) => (
                            <p key={i} className={`${glassSoft} rounded-[22px] px-4 py-3 text-[13px] leading-6 text-[var(--color-foreground)]/82`}>
                              {ex}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="mb-5 rounded-[24px] border border-[var(--color-primary)]/12 bg-[rgba(255,132,0,0.08)] p-4">
                        <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-foreground)]">
                          <Lightbulb size={14} className="text-[var(--color-primary)]" /> {t(lang, 'vocab_mnemonic')}
                        </h4>
                        <p className="text-[13px] leading-6 text-[var(--color-foreground)]/78">{selectedWord.mnemonic}</p>
                      </div>

                      {selectedWord.synonyms.length > 0 && (
                        <div>
                          <h4 className="mb-3 text-[13px] font-semibold text-[var(--color-foreground)]">{t(lang, 'vocab_synonyms')}</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedWord.synonyms.map((s, i) => (
                              <span key={i} className={`${glassSoft} rounded-full px-3 py-1.5 text-[12px] text-[var(--color-foreground)]/78`}>
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {isSetModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#6f4b22]/18 p-8 backdrop-blur-md"
            onClick={() => setIsSetModalOpen(false)}
          >
            <div
              className={`${glassPanel} w-full max-w-[760px] rounded-[32px] px-7 pb-7 pt-6`}
              style={{ WebkitBackdropFilter: 'blur(26px) saturate(1.55)', backdropFilter: 'blur(26px) saturate(1.55)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-[22px] font-bold text-[#1A1A1A]">学习集管理</h3>
                  <p className="mt-1 text-[13px] text-[#857B72]">保持功能不变，但把操作都收进玻璃弹层。</p>
                </div>
                <button onClick={() => setIsSetModalOpen(false)} className="rounded-full p-2 text-[#8A8178] transition-colors hover:bg-white/50 hover:text-[#1A1A1A]">
                  <X size={18} />
                </button>
              </div>

              <div className="mb-5">
                <label className="mb-2 block text-[12px] uppercase tracking-[0.16em] text-[#958B82]">文件夹名称</label>
                <div className="flex items-center gap-3">
                  <input
                    value={setNameInput}
                    onChange={(e) => setSetNameInput(e.target.value)}
                    className={`${glassSoft} flex-1 rounded-[20px] px-4 py-3 text-[14px] text-[#1A1A1A] outline-none`}
                    placeholder="例如：商务英语 / N2 高频词"
                  />
                  <button
                    onClick={handleRenameSet}
                    disabled={setActionLoading || !setNameInput.trim()}
                    className="rounded-[20px] bg-[#FF8400] px-4 py-3 text-[13px] font-semibold text-white shadow-[0_14px_28px_rgba(255,132,0,0.24)] disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <label className="mb-2 block text-[12px] uppercase tracking-[0.16em] text-[#958B82]">批量添加单词</label>
                <textarea
                  value={batchWordsInput}
                  onChange={(e) => setBatchWordsInput(e.target.value)}
                  placeholder="可粘贴多行，支持空格/逗号/换行自动分词"
                  rows={5}
                  className={`${glassSoft} w-full rounded-[24px] px-4 py-3 text-[14px] text-[#1A1A1A] outline-none resize-none`}
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleBatchAddToSet}
                    disabled={setActionLoading}
                    className="rounded-[20px] bg-[#FF8400] px-4 py-3 text-[13px] font-semibold text-white shadow-[0_14px_28px_rgba(255,132,0,0.24)] disabled:opacity-50"
                  >
                    {setActionLoading ? '处理中...' : '批量添加到学习集'}
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[12px] uppercase tracking-[0.16em] text-[#958B82]">当前学习集单词（{setWords.length}）</p>
                <div className={`${glassSoft} max-h-[320px] overflow-y-auto rounded-[24px] p-2`}>
                  {setWords.length === 0 && (
                    <p className="px-3 py-4 text-[13px] text-[#7E756C]">还没有单词，先批量添加一组。</p>
                  )}
                  {setWords.map((item) => (
                    <div key={item.id} className="rounded-[18px] px-3 py-3 text-[#1A1A1A] odd:bg-white/28">
                      <p className="text-[14px] font-medium">
                        {item.word}
                        <span className="ml-2 text-[12px] text-[#90867E]">{item.phonetic || ''}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-white">
      {/* ===== Header ===== */}
      <div className="relative z-10 px-5 pt-5">
        <div className="glass-card-strong rounded-[30px] px-5 py-5">
          <div className="mb-3 flex items-center gap-2 text-[var(--color-primary)]">
            <div className="glass-card-elevated flex h-10 w-10 items-center justify-center rounded-2xl">
              <Sparkles size={18} />
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">Glass Vocabulary</span>
          </div>
          <h1 className="text-[24px] font-bold text-[var(--color-foreground)] font-secondary">{t(lang, 'vocab_title')}</h1>
          <p className="text-[12px] text-[var(--color-muted)] mt-1">
            {tf(lang, 'vocab_current_count', { count: vocabulary.length })}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="glass-card-elevated rounded-[20px] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Filtered</p>
              <p className="mt-1 text-[20px] font-bold text-[var(--color-foreground)]">{filteredList.length}</p>
            </div>
            <div className="glass-card-elevated rounded-[20px] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Mode</p>
              <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">{t(lang, filterOptions.find(option => option.value === activeFilter)?.key || 'vocab_filter_new')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 搜索框 ===== */}
      <div className="relative z-10 px-5 mt-4">
        <div className="glass-card-elevated flex items-center gap-3 rounded-[24px] px-4 py-3">
          <Search size={18} className="text-[var(--color-muted)] shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            placeholder={t(lang, 'vocab_search_placeholder')}
            className="flex-1 bg-transparent text-[14px] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-light)] outline-none"
          />
          {isSearching && <Loader2 size={16} className="text-[var(--color-primary)] animate-spin shrink-0" />}
          {searchQuery && !isSearching && (
            <button onClick={() => { setSearchQuery(''); setSearchResult(null) }} className="rounded-full p-1">
              <X size={16} className="text-[var(--color-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* ===== AI 搜索结果 ===== */}
      {searchResult && (
        <div className="relative z-10 mx-5 mt-4">
          <div className="glass-card-strong rounded-[28px] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-[var(--color-primary)]" />
                <span className="text-[12px] text-[var(--color-primary)] font-semibold">{t(lang, 'vocab_ai_result')}</span>
              </div>
              <button onClick={() => setSearchResult(null)}>
                <X size={14} className="text-[var(--color-muted)]" />
              </button>
            </div>
            <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">
              {searchResult.word}
              {shouldShowPhonetic(searchResult.word, searchResult.phonetic) && (
                <span className="text-[12px] font-normal text-[var(--color-muted)] ml-2">{searchResult.phonetic}</span>
              )}
            </h3>
            <p className="text-[14px] text-[var(--color-foreground)] mt-1">{searchResult.meaning}</p>
            {searchResult.examples.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-[var(--color-muted)] mb-1 flex items-center gap-1">
                  <BookOpen size={12} /> {t(lang, 'vocab_examples')}
                </p>
                {searchResult.examples.map((ex, i) => (
                  <p key={i} className="glass-card-elevated mb-1.5 rounded-[16px] px-3 py-2 text-[13px] text-[var(--color-foreground)] leading-relaxed">
                    {ex}
                  </p>
                ))}
              </div>
            )}
            {searchResult.mnemonic && (
              <div className="glass-card-soft mt-3 flex items-start gap-2 rounded-[18px] p-2.5">
                <Lightbulb size={14} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
                <p className="text-[12px] text-[var(--color-foreground)] leading-relaxed">{searchResult.mnemonic}</p>
              </div>
            )}
            {searchResult.synonyms.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[var(--color-muted)]">{t(lang, 'vocab_synonyms')}</span>
                {searchResult.synonyms.map((s, i) => (
                  <span key={i} className="glass-pill text-[11px] px-2 py-0.5 rounded-full text-[var(--color-foreground)]">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 筛选标签 ===== */}
      <div className="relative z-10 flex items-center gap-2 px-5 mt-4 overflow-x-auto pb-1">
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => setActiveFilter(option.value)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
              activeFilter === option.value
                ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_24px_rgba(255,132,0,0.24)]'
                : 'glass-pill text-[var(--color-muted)]'
            }`}
          >
            {t(lang, option.key)}
          </button>
        ))}
      </div>

      {/* ===== 自定义学习集 ===== */}
      <div className="relative z-10 mx-5 mt-4">
        <div className="glass-card-strong rounded-[28px] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">自定义学习集</h3>
            <div className="flex items-center gap-1">
              <button
                className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 ${setSortMode === 'time' ? 'bg-[var(--color-primary)] text-white' : 'glass-pill text-[var(--color-muted)]'}`}
                onClick={() => setSetSortMode('time')}
              >
                <Clock3 size={12} /> 时间
              </button>
              <button
                className={`px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 ${setSortMode === 'name' ? 'bg-[var(--color-primary)] text-white' : 'glass-pill text-[var(--color-muted)]'}`}
                onClick={() => setSetSortMode('name')}
              >
                <ArrowDownAZ size={12} /> 命名
              </button>
            </div>
          </div>

          {customSetError && (
            <div className="mb-2 px-3 py-2 rounded-[18px] bg-[var(--color-error)]/10 text-[12px] text-[var(--color-error)]">
              {customSetError}
            </div>
          )}

          <div
            ref={folderScrollRef}
            onWheel={handleFolderWheel}
            className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              className="glass-card-soft glass-card-interactive flex h-[84px] w-[120px] shrink-0 flex-col items-center justify-center gap-1 rounded-[22px] border border-dashed border-[var(--color-primary)]/50 text-[var(--color-primary)]"
              onClick={handleCreateSet}
              disabled={setActionLoading}
            >
              <Plus size={18} />
              <span className="text-[12px] font-semibold">添加文件夹</span>
            </button>

            {setPanelLoading && (
              <div className="glass-card-soft flex h-[84px] w-[140px] shrink-0 items-center justify-center rounded-[22px] text-[12px] text-[var(--color-muted)]">
                读取中...
              </div>
            )}

            {!setPanelLoading && customSets.map((setItem) => (
              <button
                key={setItem.id}
                className={`shrink-0 w-[140px] h-[84px] rounded-[22px] px-3 py-2 text-left ${
                  selectedSetId === setItem.id ? 'bg-[var(--color-primary)] text-white shadow-[0_14px_28px_rgba(255,132,0,0.22)]' : 'glass-card-soft text-[var(--color-foreground)]'
                }`}
                onClick={() => handleOpenSetModal(setItem.id)}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <FolderOpen size={14} />
                  <span className="text-[12px] font-semibold truncate">{setItem.name}</span>
                </div>
                <p className={`text-[11px] ${selectedSetId === setItem.id ? 'text-white/90' : 'text-[var(--color-muted)]'}`}>
                  {setItem.count} 词
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 词汇量测试入口 ===== */}
      <div
        className="glass-card-strong glass-card-interactive relative z-10 mx-5 mt-4 flex items-center gap-3 rounded-[28px] p-4"
        onClick={() => navigate('/vocab-test')}
      >
        <div className="w-11 h-11 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0 shadow-[0_12px_24px_rgba(255,132,0,0.24)]">
          <Trophy size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{t(lang, 'vocab_test_title')}</p>
          <p className="text-[12px] text-[var(--color-muted)]">
            {tf(lang, 'vocab_test_count', { count: vocabulary.length })}
          </p>
        </div>
        <ChevronRight size={18} className="text-[var(--color-muted)] shrink-0" />
      </div>

      {/* ===== 词汇列表 ===== */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 mt-4 pb-6">
        <div className="glass-card-strong rounded-[28px] p-4">
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
                {searchQuery ? t(lang, 'vocab_no_match') : t(lang, 'vocab_empty')}
              </p>
            </div>
          )}

          {/* 词汇卡片 */}
          {!vocabLoading && filteredList.map((item) => {
            const active = swipedId === item.id
            const translateX = active ? swipeOffset : 0
            const swipeVisible = active && swipeOffset > 2
            return (
              <div key={item.id} className="relative isolate overflow-hidden rounded-[24px] mb-3 last:mb-0">
                {!isDesktop && (
                  <div
                    className={`glass-danger-rail absolute inset-y-0 left-0 z-0 w-[84px] rounded-[24px] transition-all duration-200 ${
                      swipeVisible ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-4 opacity-0 pointer-events-none'
                    }`}
                  >
                    <button
                      className="w-full h-full flex flex-col items-center justify-center gap-1 text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteWord(item.id, item.word)
                      }}
                      title={t(lang, 'vocab_delete_title')}
                    >
                      <Trash2 size={16} />
                      <span className="text-[11px] font-semibold">{t(lang, 'vocab_delete')}</span>
                    </button>
                  </div>
                )}

                <div
                  className={`${listItemShell} relative z-10 flex items-center gap-3 rounded-[24px] px-3.5 py-3.5 transition-transform duration-150 active:bg-[var(--color-background-secondary)]/50`}
                  style={{ transform: isDesktop ? 'translateX(0px)' : `translateX(${translateX}px)` }}
                  onClick={() => {
                    if (active && swipeOffset > 0) {
                      setSwipedId(null)
                      setSwipeOffset(0)
                      return
                    }
                    handleWordClick(item)
                  }}
                  onTouchStart={isDesktop ? undefined : (e) => handleTouchStart(item.id, e.touches[0].clientX, e.touches[0].clientY)}
                  onTouchMove={isDesktop ? undefined : (e) => handleTouchMove(e.touches[0].clientX, e.touches[0].clientY)}
                  onTouchEnd={isDesktop ? undefined : handleTouchEnd}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleWordClick(item)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="w-1 h-10 rounded-full" style={{
                    backgroundColor:
                      item.mastery_level >= 4 ? '#22C55E' :
                      item.mastery_level >= 2 ? '#FFB366' :
                      '#EF4444'
                  }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-[var(--color-foreground)]">{item.word}</span>
                      {shouldShowPhonetic(item.word, item.phonetic) ? (
                        <span className="text-[11px] text-[var(--color-muted)]">{item.phonetic}</span>
                      ) : item.language_label ? (
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-primary)]">{item.language_label}</span>
                      ) : item.source === 'translate' && isCjkText(item.word) ? (
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] text-[var(--color-primary)]">翻译收藏</span>
                      ) : null}
                    </div>
                    <p className="text-[12px] text-[var(--color-muted)] mt-0.5 truncate">{item.meaning || ''}</p>
                  </div>

                  <button className="p-1" onClick={(e) => { e.stopPropagation(); speakAuto(item.word) }}>
                    <Volume2 size={16} className="text-[var(--color-muted)]" />
                  </button>

                  <button className="p-1" onClick={(e) => { e.stopPropagation(); toggleStar(item.id) }}>
                    <Star size={16} className={item.starred ? 'text-[var(--color-primary)] fill-[var(--color-primary)]' : 'text-[var(--color-border-dark)]'} />
                  </button>

                  <button
                    className="p-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMasteryClick(item)
                    }}
                    title={item.mastery_level >= 5 ? '查看已掌握状态' : '查看掌握进度'}
                  >
                    <BadgeCheck size={16} className={item.mastery_level >= 5 ? 'text-[var(--color-success)]' : 'text-[var(--color-border-dark)]'} />
                  </button>

                  <button
                    className="p-1 hidden md:block"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteWord(item.id, item.word)
                    }}
                    title={t(lang, 'vocab_delete_title')}
                  >
                    <Trash2 size={16} className="text-[var(--color-muted)]" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== 学习集管理弹窗 ===== */}
      {isSetModalOpen && (
        <div
          className={`glass-modal-backdrop fixed inset-0 z-50 ${isDesktop ? 'flex items-center justify-center p-6' : 'flex items-end'}`}
          onClick={() => setIsSetModalOpen(false)}
        >
          <div
            className={isDesktop
              ? 'glass-modal-sheet glass-modal-sheet-desktop w-full max-w-[680px] max-h-[82vh] overflow-y-auto px-6 pb-6 pt-5'
              : 'glass-modal-sheet w-full max-h-[78%] overflow-y-auto px-5 pb-8 pt-5'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">学习集管理</h3>
              <button onClick={() => setIsSetModalOpen(false)}>
                <X size={18} className="text-[var(--color-muted)]" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-[12px] text-[var(--color-muted)] mb-1">文件夹名称</label>
              <div className="flex items-center gap-2">
                <input
                  value={setNameInput}
                  onChange={(e) => setSetNameInput(e.target.value)}
                  className="glass-input-shell flex-1 rounded-[18px] px-3 py-2 text-[14px] text-[var(--color-foreground)] outline-none"
                  placeholder="例如：商务英语 / N2 高频词"
                />
                <button
                  onClick={handleRenameSet}
                  disabled={setActionLoading || !setNameInput.trim()}
                  className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[13px] disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[12px] text-[var(--color-muted)] mb-1">批量添加单词</label>
              <textarea
                value={batchWordsInput}
                onChange={(e) => setBatchWordsInput(e.target.value)}
                placeholder="可粘贴多行，支持空格/逗号/换行自动分词"
                rows={5}
                className="glass-input-shell w-full rounded-[18px] px-3 py-2 text-[14px] text-[var(--color-foreground)] outline-none resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleBatchAddToSet}
                  disabled={setActionLoading}
                  className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[13px] disabled:opacity-50"
                >
                  {setActionLoading ? '处理中...' : '批量添加到学习集'}
                </button>
              </div>
            </div>

            <div>
              <p className="text-[12px] text-[var(--color-muted)] mb-2">当前学习集单词（{setWords.length}）</p>
              <div className="glass-card-soft max-h-[260px] overflow-y-auto rounded-[18px]">
                {setWords.length === 0 && (
                  <p className="text-[13px] text-[var(--color-muted)] p-3">还没有单词，先批量添加一组。</p>
                )}
                {setWords.map((item) => (
                  <div key={item.id} className="px-3 py-2 border-b border-white/20 last:border-b-0">
                    <p className="text-[14px] font-medium text-[var(--color-foreground)]">
                      {item.word}
                      <span className="ml-2 text-[12px] text-[var(--color-muted)]">{item.phonetic || ''}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 单词详情弹窗 ===== */}
      {(selectedWord || isLoadingDetail || detailError) && (
        <div
          className={`glass-modal-backdrop fixed inset-0 z-50 ${isDesktop ? 'flex items-center justify-center p-6' : 'flex items-end'}`}
          onClick={closeDetail}
        >
          <div
            className={isDesktop
              ? 'glass-modal-sheet glass-modal-sheet-desktop w-full max-w-[640px] max-h-[80vh] overflow-y-auto px-6 pb-6 pt-5'
              : 'glass-modal-sheet w-full max-h-[70%] overflow-y-auto px-5 pb-8 pt-5'}
            onClick={(e) => e.stopPropagation()}
          >
            {isLoadingDetail && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 size={28} className="text-[var(--color-primary)] animate-spin mb-3" />
                <p className="text-[13px] text-[var(--color-muted)]">{t(lang, 'vocab_ai_analyzing')}</p>
              </div>
            )}

            {detailError && !isLoadingDetail && (
              <div className="py-8 text-center">
                <p className="text-[14px] text-[var(--color-error)]">{detailError}</p>
                <button onClick={closeDetail} className="mt-3 text-[13px] text-[var(--color-primary)]">{t(lang, 'common_close')}</button>
              </div>
            )}

            {selectedWord && !isLoadingDetail && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[var(--color-primary)]" />
                    <span className="text-[13px] text-[var(--color-primary)] font-semibold">{t(lang, 'vocab_ai_deep_result')}</span>
                  </div>
                  <button onClick={closeDetail}>
                    <X size={18} className="text-[var(--color-muted)]" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-[24px] font-bold text-[var(--color-foreground)]">{selectedWord.word}</h2>
                  <button onClick={() => speakAuto(selectedWord.word)}>
                    <Volume2 size={18} className="text-[var(--color-primary)]" />
                  </button>
                </div>
                {shouldShowPhonetic(selectedWord.word, selectedWord.phonetic) && (
                  <p className="text-[13px] text-[var(--color-muted)] mb-1">{selectedWord.phonetic}</p>
                )}
                <p className="text-[15px] text-[var(--color-foreground)] mb-4">{selectedWord.meaning}</p>

                <div className="mb-4">
                  <h4 className="text-[13px] font-semibold text-[var(--color-foreground)] mb-2 flex items-center gap-1.5">
                    <BookOpen size={14} className="text-[var(--color-info)]" /> {t(lang, 'vocab_examples')}
                  </h4>
                  {selectedWord.examples.map((ex, i) => (
                    <p key={i} className="text-[13px] text-[var(--color-foreground)] leading-relaxed pl-3 border-l-2 border-[var(--color-info)]/30 mb-2">
                      {ex}
                    </p>
                  ))}
                </div>

                <div className="glass-card-soft mb-4 rounded-[18px] p-3">
                  <h4 className="text-[13px] font-semibold text-[var(--color-foreground)] mb-1 flex items-center gap-1.5">
                    <Lightbulb size={14} className="text-[var(--color-primary)]" /> {t(lang, 'vocab_mnemonic')}
                  </h4>
                  <p className="text-[13px] text-[var(--color-foreground)] leading-relaxed">{selectedWord.mnemonic}</p>
                </div>

                {selectedWord.synonyms.length > 0 && (
                  <div>
                    <h4 className="text-[13px] font-semibold text-[var(--color-foreground)] mb-2">{t(lang, 'vocab_synonyms')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedWord.synonyms.map((s, i) => (
                        <span key={i} className="glass-pill px-3 py-1 rounded-full text-[12px] text-[var(--color-foreground)]">
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
