import { useState, useEffect, useRef, type WheelEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Star, Sparkles, ChevronRight, Trophy, Volume2, BadgeCheck, Check,
  X, Loader2, BookOpen, Lightbulb, Trash2, Plus, FolderOpen, ArrowDownAZ, Clock3,
} from 'lucide-react'
import { getWordDetail, type WordDetail } from '../services/gemini'
import { useVocabulary, type VocabFilter } from '../hooks/useVocabulary'
import { speakAuto } from '../lib/tts'
import { t, tf, useAppLanguage } from '../lib/i18n'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { supabase, type PublicWordbook, type UserWordbook } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDailyNewWordGoal, normalizeDailyGoal } from '../lib/learnSettings'
import {
  isCjkText,
  matchesSearchText,
  normalizeLookupKey,
  normalizeVocabWord,
  shouldShowPhonetic,
} from '../lib/text'
import { getIntervalLabel, getReviewCycleDaysFromLocalStorage } from '../lib/ebbinghaus'
import {
  ensureVocabSetLearnSettings,
  getVocabSetLearnSettings,
  saveVocabSetLearnSettings,
} from '../lib/vocabSetLearnSettings'
import {
  markVocabularySchemaLegacy,
  markVocabularySchemaModern,
  shouldUseLegacyVocabularySchema,
} from '../lib/vocabularySchema'

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
  { key: 'vocab_filter_new', value: 'today' },
  { key: 'vocab_filter_mastered', value: 'mastered' },
  { key: 'vocab_filter_ai', value: 'ai_classify' },
  { key: 'vocab_filter_starred', value: 'starred' },
]

const WORDBOOK_FETCH_PAGE_SIZE = 1000
const WORDBOOK_IMPORT_CHUNK_SIZE = 250
const WORD_LOOKUP_CHUNK_SIZE = 500
const VOCAB_SET_DAILY_GOAL_SYNC_DISABLED_KEY = 'linswift_vocab_set_daily_goal_sync_disabled'
const DAILY_GOAL_PRESETS = [5, 10, 20, 30]

const WORDBOOK_CATEGORY_LABELS: Record<string, string> = {
  exam: '考试词本',
  discipline: '学科词本',
  academic: '学术词本',
}

function getWordbookCategoryLabel(book: Pick<PublicWordbook, 'category' | 'exam_type'>) {
  if (book.exam_type?.trim()) return book.exam_type.trim()
  return WORDBOOK_CATEGORY_LABELS[book.category] || '公共词本'
}

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

function getWordbookPacingEstimate(wordCount: number, dailyGoal: number, reviewCycleDays: number) {
  const safeWordCount = Math.max(0, Number(wordCount) || 0)
  const safeDailyGoal = Math.max(1, Number(dailyGoal) || 1)
  const firstPassDays = Math.max(1, Math.ceil(safeWordCount / safeDailyGoal))
  const masteryDays = firstPassDays + Math.max(0, reviewCycleDays)
  return {
    firstPassDays,
    masteryDays,
  }
}

type CustomSetSummary = {
  id: number
  name: string
  created_at: string
  count: number
  dailyGoal: number
  sourceWordbookId: number | null
}

type PendingWordbookImportPlan = {
  book: PublicWordbook
  dailyGoalDraft: string
}

type VocabMainSection = 'vocabulary' | 'sets'

export default function VocabPage() {
  const navigate = useNavigate()
  const lang = useAppLanguage()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { user } = useAuth()
  const dailyNewWordGoal = getDailyNewWordGoal()
  const reviewCycleDays = getReviewCycleDaysFromLocalStorage()

  // ===== Supabase 词汇数据 =====
  const { vocabulary, loading: vocabLoading, fetchVocabulary, addWords, toggleStar, deleteWord } = useVocabulary()

  // ===== 本地 UI 状态 =====
  const [activeFilter, setActiveFilter] = useState<VocabFilter>('today')
  const [activeSection, setActiveSection] = useState<VocabMainSection>('vocabulary')
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
  const [publicWordbooks, setPublicWordbooks] = useState<PublicWordbook[]>([])
  const [userWordbooks, setUserWordbooks] = useState<Record<number, UserWordbook>>({})
  const [publicWordbooksLoading, setPublicWordbooksLoading] = useState(false)
  const [publicWordbooksError, setPublicWordbooksError] = useState<string | null>(null)
  const [importingWordbookId, setImportingWordbookId] = useState<number | null>(null)
  const [customSets, setCustomSets] = useState<CustomSetSummary[]>([])
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null)
  const [isSetModalOpen, setIsSetModalOpen] = useState(false)
  const [isWordbookMarketOpen, setIsWordbookMarketOpen] = useState(false)
  const [pendingWordbookImportPlan, setPendingWordbookImportPlan] = useState<PendingWordbookImportPlan | null>(null)
  const [setNameInput, setSetNameInput] = useState('')
  const [selectedSetDailyGoalDraft, setSelectedSetDailyGoalDraft] = useState('')
  const [batchWordsInput, setBatchWordsInput] = useState('')
  const [setWords, setSetWords] = useState<Array<{ id: number; word: string; phonetic: string | null }>>([])
  const [setActionLoading, setSetActionLoading] = useState(false)
  const [showCreateSetInput, setShowCreateSetInput] = useState(false)
  const [newSetName, setNewSetName] = useState('')
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

  const sortSets = (rows: CustomSetSummary[], mode: 'time' | 'name') => {
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

  const describePublicWordbookError = (message: string) => {
    const normalized = String(message || '').toLowerCase()
    if (
      normalized.includes('public_wordbooks')
      || normalized.includes('public_wordbook_words')
      || normalized.includes('user_wordbooks')
      || normalized.includes('import_public_wordbook')
      || normalized.includes('source_wordbook_id')
    ) {
      return '公共词本库未初始化，请先执行 supabase/migrations/20260325170000_public_wordbooks.sql'
    }
    if (normalized.includes('language_code') || normalized.includes('language_label')) {
      return '词汇语言字段未初始化，请先执行 supabase/migrations/20260319093000_user_vocabulary_language.sql'
    }
    return message
  }

  const isVocabularyLanguageSchemaMissing = (message: string) => {
    const normalized = String(message || '').toLowerCase()
    return normalized.includes('language_code')
      || normalized.includes('language_label')
      || normalized.includes('user_id,word,language_code')
      || normalized.includes('import_public_wordbook')
  }

  const isSetDailyGoalSchemaMissing = (message: string) => {
    const normalized = String(message || '').toLowerCase()
    return normalized.includes('daily_new_goal')
      || normalized.includes("column 'daily_new_goal'")
      || normalized.includes('column "daily_new_goal"')
  }

  const shouldSkipSetDailyGoalCloudSync = () => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(VOCAB_SET_DAILY_GOAL_SYNC_DISABLED_KEY) === '1'
  }

  const markSetDailyGoalCloudSyncDisabled = () => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(VOCAB_SET_DAILY_GOAL_SYNC_DISABLED_KEY, '1')
  }

  const markSetDailyGoalCloudSyncEnabled = () => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(VOCAB_SET_DAILY_GOAL_SYNC_DISABLED_KEY)
  }

  const readPersistedSetDailyGoal = (row: any) => {
    const value = Number(row?.daily_new_goal)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const syncSetDailyGoalToCloud = async (setId: number, dailyGoal: number) => {
    if (!user || !setId) return
    if (shouldSkipSetDailyGoalCloudSync()) return

    const { error } = await supabase
      .from('user_vocab_sets')
      .update({ daily_new_goal: dailyGoal })
      .eq('user_id', user.id)
      .eq('id', setId)

    if (!error) {
      markSetDailyGoalCloudSyncEnabled()
      return
    }

    if (isSetDailyGoalSchemaMissing(error.message)) {
      markSetDailyGoalCloudSyncDisabled()
      return
    }

    if (error) {
      throw new Error(describeSetError(error.message))
    }
  }

  const loadCustomSets = async (mode: 'time' | 'name' = setSortMode) => {
    if (!user) {
      setSetPanelLoading(false)
      setCustomSets([])
      setSelectedSetId(null)
      return []
    }
    setSetPanelLoading(true)
    setCustomSetError(null)
    const [setsRes, mappingRes] = await Promise.all([
      supabase
        .from('user_vocab_sets')
        .select('*')
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
      return []
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
      dailyGoal: getVocabSetLearnSettings(
        user.id,
        Number(row.id),
        dailyNewWordGoal,
        { dailyGoal: readPersistedSetDailyGoal(row) ?? undefined }
      ).dailyGoal,
      sourceWordbookId: Number(row.source_wordbook_id) > 0 ? Number(row.source_wordbook_id) : null,
    }))

    if ((setsRes.data || []).some((row: any) => Object.prototype.hasOwnProperty.call(row, 'daily_new_goal'))) {
      markSetDailyGoalCloudSyncEnabled()
    }

    const sorted = sortSets(rows, mode)
    setCustomSets(sorted)
    if (sorted.length > 0 && !sorted.some(s => s.id === selectedSetId)) {
      setSelectedSetId(sorted[0].id)
    }
    if (sorted.length === 0) setSelectedSetId(null)
    setSetPanelLoading(false)
    return sorted
  }

  const loadPublicWordbooks = async () => {
    setPublicWordbooksLoading(true)
    setPublicWordbooksError(null)

    const { data, error } = await supabase
      .from('public_wordbooks')
      .select('*')
      .order('category', { ascending: true })
      .order('word_count', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      setPublicWordbooks([])
      setPublicWordbooksError(describePublicWordbookError(error.message))
      setPublicWordbooksLoading(false)
      return []
    }

    const rows = (data || []) as PublicWordbook[]
    setPublicWordbooks(rows)
    setPublicWordbooksLoading(false)
    return rows
  }

  const loadUserWordbooks = async () => {
    if (!user) {
      setUserWordbooks({})
      return {}
    }

    const { data, error } = await supabase
      .from('user_wordbooks')
      .select('*')
      .eq('user_id', user.id)

    if (error) {
      setUserWordbooks({})
      setPublicWordbooksError(describePublicWordbookError(error.message))
      return {}
    }

    const nextMap = ((data || []) as UserWordbook[]).reduce<Record<number, UserWordbook>>((acc, row) => {
      acc[row.wordbook_id] = row
      return acc
    }, {})

    setUserWordbooks(nextMap)
    return nextMap
  }

  useEffect(() => {
    loadCustomSets(setSortMode)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadPublicWordbooks()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadUserWordbooks()
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
      window.alert(`"${item.word}" 已完成完整艾宾浩斯${cycle}天周期，当前属于已掌握词。`)
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
      `"${item.word}" 还没有完成完整艾宾浩斯${cycle}天周期。\n\n当前阶段：${stageLabel}\n累计复习：${reviewCount} 次\n下次复习：${nextReviewLabel}\n\n要进入"已掌握"，必须按计划完成整个复习周期，不能在词库里手动跳过。`
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
    const name = newSetName.trim()
    if (!name) {
      setShowCreateSetInput(true)
      return
    }
    setShowCreateSetInput(false)
    setNewSetName('')
    setSetActionLoading(true)
    setCustomSetError(null)
    const { data, error } = await supabase
      .from('user_vocab_sets')
      .insert({
        user_id: user.id,
        name: name.trim(),
      })
      .select('*')
      .single()
    setSetActionLoading(false)
    if (error) {
      const msg = describeSetError(error.message)
      setCustomSetError(msg)
      window.alert(msg)
      return
    }
    const nextSetId = Number(data?.id || 0)
    if (nextSetId > 0) {
      ensureVocabSetLearnSettings(user.id, nextSetId, dailyNewWordGoal)
      void syncSetDailyGoalToCloud(nextSetId, dailyNewWordGoal).catch((err) => {
        console.warn('同步学习集每日目标失败：', err)
      })
    }
    await loadCustomSets(setSortMode)
    if (nextSetId > 0) {
      await openSetModal(nextSetId, data?.name || name.trim())
    }
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

  const openSetModal = async (setId: number, name?: string) => {
    const target = customSets.find(s => s.id === setId)
    const settings = ensureVocabSetLearnSettings(
      user?.id,
      setId,
      dailyNewWordGoal,
      { dailyGoal: target?.dailyGoal ?? undefined }
    )
    setSelectedSetId(setId)
    setSetNameInput(name || target?.name || '')
    setSelectedSetDailyGoalDraft(String(settings.dailyGoal))
    setBatchWordsInput('')
    setIsSetModalOpen(true)
    await loadSetWords(setId)
  }

  const handleOpenSetModal = async (setId: number) => {
    const target = customSets.find(s => s.id === setId)
    if (!target) return
    await openSetModal(setId, target.name)
  }

  const handleRenameSet = async () => {
    if (selectedSetIsImported) return
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
    if (selectedSetIsImported) return
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
  const activeFilterLabel = t(lang, filterOptions.find(option => option.value === activeFilter)?.key || 'vocab_filter_new')
  const activeSectionTitle = activeSection === 'vocabulary' ? t(lang, 'vocab_title') : '学习集'
  const activeSectionSubtitle = activeSection === 'vocabulary'
    ? `当前筛选 ${filteredList.length} 词`
    : `${customSets.length} 个学习集 · ${publicWordbooks.length} 本词本`
  const sectionTabs: Array<{ key: VocabMainSection; label: string; subtitle: string }> = [
    {
      key: 'vocabulary',
      label: t(lang, 'vocab_title'),
      subtitle: `当前筛选 ${filteredList.length} 词`,
    },
    {
      key: 'sets',
      label: '学习集',
      subtitle: `${customSets.length} 个学习集`,
    },
  ]
  const selectedSet = customSets.find(set => set.id === selectedSetId) || null
  const selectedSetIsImported = Boolean(selectedSet?.sourceWordbookId)
  const selectedSetPacing = selectedSet
    ? getWordbookPacingEstimate(setWords.length || selectedSet.count, selectedSet.dailyGoal, reviewCycleDays)
    : null
  const selectedSetPreviewWords = setWords.slice(0, isDesktop ? 12 : 8)
  const pendingWordbookDailyGoal = normalizeDailyGoal(
    pendingWordbookImportPlan?.dailyGoalDraft || dailyNewWordGoal
  )
  const pendingWordbookPacing = pendingWordbookImportPlan
    ? getWordbookPacingEstimate(
        pendingWordbookImportPlan.book.word_count,
        pendingWordbookDailyGoal,
        reviewCycleDays
      )
    : null

  const getSetDailyGoal = (setId: number | null | undefined) => {
    if (!setId) return dailyNewWordGoal
    return customSets.find((item) => item.id === setId)?.dailyGoal
      || getVocabSetLearnSettings(user?.id, setId, dailyNewWordGoal).dailyGoal
  }

  const applySelectedSetDailyGoal = (value: string | number) => {
    if (!user || !selectedSetId) return
    const nextSettings = saveVocabSetLearnSettings(
      user.id,
      selectedSetId,
      { dailyGoal: normalizeDailyGoal(value) },
      dailyNewWordGoal
    )
    setSelectedSetDailyGoalDraft(String(nextSettings.dailyGoal))
    setCustomSets((prev) => prev.map((item) => (
      item.id === selectedSetId
        ? { ...item, dailyGoal: nextSettings.dailyGoal }
        : item
    )))
    void syncSetDailyGoalToCloud(selectedSetId, nextSettings.dailyGoal).catch((err) => {
      console.warn('同步学习集每日目标失败：', err)
    })
  }

  const adjustSelectedSetDailyGoal = (delta: number) => {
    const currentGoal = normalizeDailyGoal(
      selectedSetDailyGoalDraft || selectedSet?.dailyGoal || dailyNewWordGoal
    )
    applySelectedSetDailyGoal(currentGoal + delta)
  }

  const openWordbookImportPlanner = (book: PublicWordbook) => {
    setPendingWordbookImportPlan({
      book,
      dailyGoalDraft: String(dailyNewWordGoal),
    })
  }

  const closeWordbookImportPlanner = () => {
    setPendingWordbookImportPlan(null)
  }

  const applyPendingWordbookDailyGoal = (value: string | number) => {
    setPendingWordbookImportPlan((current) => {
      if (!current) return current
      return {
        ...current,
        dailyGoalDraft: String(normalizeDailyGoal(value)),
      }
    })
  }

  const adjustPendingWordbookDailyGoal = (delta: number) => {
    applyPendingWordbookDailyGoal(pendingWordbookDailyGoal + delta)
  }

  const handleStartSetStudy = () => {
    if (!selectedSetId) return
    setIsSetModalOpen(false)
    navigate(`/flashcard?setId=${selectedSetId}`)
  }

  const chunkItems = <T,>(items: T[], size: number) => {
    const chunks: T[][] = []
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size))
    }
    return chunks
  }

  const fetchWordbookRows = async (wordbookId: number) => {
    const allRows: Array<{
      word: string
      meaning: string | null
      phonetic: string | null
      example_sentence: string | null
    }> = []

    let from = 0

    while (true) {
      const to = from + WORDBOOK_FETCH_PAGE_SIZE - 1
      const { data, error } = await supabase
        .from('public_wordbook_words')
        .select('word,meaning,phonetic,example_sentence')
        .eq('wordbook_id', wordbookId)
        .order('source_rank', { ascending: true, nullsFirst: false })
        .order('word', { ascending: true })
        .range(from, to)

      if (error) {
        throw new Error(describePublicWordbookError(error.message))
      }

      const rows = (data || []) as Array<{
        word: string
        meaning: string | null
        phonetic: string | null
        example_sentence: string | null
      }>

      allRows.push(...rows)

      if (rows.length < WORDBOOK_FETCH_PAGE_SIZE) break
      from += WORDBOOK_FETCH_PAGE_SIZE
    }

    return allRows
  }

  const ensureImportedSet = async (book: PublicWordbook) => {
    if (!user) throw new Error('请先登录后再导入词本')

    const { data, error } = await supabase
      .from('user_vocab_sets')
      .upsert({
        user_id: user.id,
        name: book.title,
        source_wordbook_id: book.id,
      }, {
        onConflict: 'user_id,source_wordbook_id',
      })
      .select('*')
      .single()

    if (error || !data?.id) {
      throw new Error(describePublicWordbookError(error?.message || '学习集创建失败'))
    }

    return {
      id: Number(data.id),
      name: data.name || book.title,
      dailyGoal: readPersistedSetDailyGoal(data),
    }
  }

  const addWordbookVocabularyFallback = async (rows: Array<{
    word: string
    meaning: string | null
    phonetic: string | null
    example_sentence: string | null
  }>) => {
    for (const chunk of chunkItems(rows, WORDBOOK_IMPORT_CHUNK_SIZE)) {
      const result = await addWords(chunk.map((row) => ({
        word: row.word,
        phonetic: row.phonetic || undefined,
        meaning: row.meaning || undefined,
        example_sentence: row.example_sentence || undefined,
        source: 'manual',
      })))

      if (result.error) {
        throw new Error(result.error)
      }
    }
  }

  const fetchVocabularyIdsByWords = async (words: string[]) => {
    if (!user || words.length === 0) return []

    const rows: Array<{ id: number; word: string }> = []

    for (const chunk of chunkItems(words, WORD_LOOKUP_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from('user_vocabulary')
        .select('id,word')
        .eq('user_id', user.id)
        .in('word', chunk)

      if (error) {
        throw new Error(describeSetError(error.message))
      }

      rows.push(...((data || []).map((row: any) => ({
        id: Number(row.id),
        word: row.word,
      }))))
    }

    return rows
  }

  const linkVocabularyToSet = async (setId: number, vocabularyRows: Array<{ id: number }>) => {
    if (!user || vocabularyRows.length === 0) return

    for (const chunk of chunkItems(vocabularyRows, WORD_LOOKUP_CHUNK_SIZE)) {
      const payload = chunk.map((row) => ({
        set_id: setId,
        user_id: user.id,
        vocabulary_id: row.id,
      }))

      const { error } = await supabase
        .from('user_vocab_set_words')
        .upsert(payload, { onConflict: 'set_id,vocabulary_id' })

      if (error) {
        throw new Error(describeSetError(error.message))
      }
    }
  }

  const markUserWordbookImported = async (book: PublicWordbook, setId: number, importedWordCount: number) => {
    if (!user) return

    const { error } = await supabase
      .from('user_wordbooks')
      .upsert({
        user_id: user.id,
        wordbook_id: book.id,
        vocab_set_id: setId,
        imported_word_count: importedWordCount,
        last_imported_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,wordbook_id',
      })

    if (error) {
      throw new Error(describePublicWordbookError(error.message))
    }
  }

  const importWordbookFallback = async (book: PublicWordbook) => {
    const setInfo = await ensureImportedSet(book)
    const rows = await fetchWordbookRows(book.id)
    await addWordbookVocabularyFallback(rows)
    const vocabularyRows = await fetchVocabularyIdsByWords(rows.map((row) => normalizeVocabWord(row.word)).filter(Boolean))
    await linkVocabularyToSet(setInfo.id, vocabularyRows)
    await markUserWordbookImported(book, setInfo.id, rows.length)
    return setInfo
  }

  const handleWordbookAction = async (book: PublicWordbook) => {
    if (!user) {
      window.alert('请先登录后再添加公共词本')
      return
    }

    const existing = userWordbooks[book.id]
    if (existing?.vocab_set_id) {
      closeWordbookImportPlanner()
      setIsWordbookMarketOpen(false)
      await openSetModal(existing.vocab_set_id, book.title)
      return
    }

    openWordbookImportPlanner(book)
  }

  const handleImportWordbook = async (book: PublicWordbook, plannedDailyGoal = dailyNewWordGoal) => {
    if (!user) {
      window.alert('请先登录后再添加公共词本')
      return
    }

    const existing = userWordbooks[book.id]
    if (existing?.vocab_set_id) {
      closeWordbookImportPlanner()
      setIsWordbookMarketOpen(false)
      await openSetModal(existing.vocab_set_id, book.title)
      return
    }

    setImportingWordbookId(book.id)
    setPublicWordbooksError(null)

    if (shouldUseLegacyVocabularySchema()) {
      try {
        const fallbackSet = await importWordbookFallback(book)
        const fallbackSettings = saveVocabSetLearnSettings(
          user.id,
          fallbackSet.id,
          { dailyGoal: plannedDailyGoal },
          fallbackSet.dailyGoal ?? dailyNewWordGoal
        )
        void syncSetDailyGoalToCloud(fallbackSet.id, fallbackSettings.dailyGoal).catch((err) => {
          console.warn('同步学习集每日目标失败：', err)
        })
        await Promise.all([
          loadCustomSets(setSortMode),
          loadUserWordbooks(),
        ])
        fetchVocabulary(activeFilter)
        setImportingWordbookId(null)
        closeWordbookImportPlanner()
        setIsWordbookMarketOpen(false)
        await openSetModal(fallbackSet.id, fallbackSet.name)
        return
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : '词本导入失败'
        setPublicWordbooksError(fallbackMessage)
        setImportingWordbookId(null)
        window.alert(fallbackMessage)
        return
      }
    }

    const { data, error } = await supabase.rpc('import_public_wordbook', {
      book_slug: book.slug,
    })

    if (error) {
      if (isVocabularyLanguageSchemaMissing(error.message)) {
        markVocabularySchemaLegacy()
        try {
          const fallbackSet = await importWordbookFallback(book)
          const fallbackSettings = saveVocabSetLearnSettings(
            user.id,
            fallbackSet.id,
            { dailyGoal: plannedDailyGoal },
            fallbackSet.dailyGoal ?? dailyNewWordGoal
          )
          void syncSetDailyGoalToCloud(fallbackSet.id, fallbackSettings.dailyGoal).catch((err) => {
            console.warn('同步学习集每日目标失败：', err)
          })
          await Promise.all([
            loadCustomSets(setSortMode),
            loadUserWordbooks(),
          ])
          fetchVocabulary(activeFilter)
          setImportingWordbookId(null)
          closeWordbookImportPlanner()
          setIsWordbookMarketOpen(false)
          await openSetModal(fallbackSet.id, fallbackSet.name)
          return
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : '词本导入失败'
          setPublicWordbooksError(fallbackMessage)
          setImportingWordbookId(null)
          window.alert(fallbackMessage)
          return
        }
      }

      const message = describePublicWordbookError(error.message)
      setPublicWordbooksError(message)
      setImportingWordbookId(null)
      window.alert(message)
      return
    }

    markVocabularySchemaModern()

    const importedSetId = Number((data as any)?.setId || 0)
    if (importedSetId > 0) {
      const importedSettings = saveVocabSetLearnSettings(
        user.id,
        importedSetId,
        { dailyGoal: plannedDailyGoal },
        dailyNewWordGoal
      )
      void syncSetDailyGoalToCloud(importedSetId, importedSettings.dailyGoal).catch((err) => {
        console.warn('同步学习集每日目标失败：', err)
      })
    }
    await Promise.all([
      loadCustomSets(setSortMode),
      loadUserWordbooks(),
    ])
    fetchVocabulary(activeFilter)
    setImportingWordbookId(null)
    closeWordbookImportPlanner()

    if (importedSetId > 0) {
      setIsWordbookMarketOpen(false)
      await openSetModal(importedSetId, book.title)
      return
    }

    setIsWordbookMarketOpen(false)
    window.alert(`已将《${book.title}》添加到你的词库`)
  }

  const handleOpenWordbookPlan = () => {
    setIsWordbookMarketOpen(false)
    navigate('/learning-settings')
  }

  const handleConfirmWordbookImport = async () => {
    if (!pendingWordbookImportPlan) return
    await handleImportWordbook(pendingWordbookImportPlan.book, pendingWordbookDailyGoal)
  }

  const wordbookMarketModal = isWordbookMarketOpen && (
    <div
      className={`glass-modal-backdrop fixed inset-0 z-50 ${isDesktop ? 'flex items-center justify-center p-6' : 'flex items-end'}`}
      onClick={() => setIsWordbookMarketOpen(false)}
    >
      <div
        className={isDesktop
          ? 'glass-modal-sheet glass-modal-sheet-desktop w-full max-w-[880px] max-h-[84dvh] overflow-hidden px-6 pb-6 pt-5'
          : 'glass-modal-sheet w-full max-h-[82%] overflow-hidden px-5 pb-8 pt-5'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">词本市场</h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">
              浏览考试、学术和学科词库；每本词本都在添加前先制定自己的学习节奏。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="glass-pill rounded-full px-3 py-1.5 text-[11px] text-[var(--color-muted)]">
              {publicWordbooks.length} 本
            </div>
            <button onClick={() => setIsWordbookMarketOpen(false)}>
              <X size={18} className="text-[var(--color-muted)]" />
            </button>
          </div>
        </div>

        <div className={`mb-4 grid gap-3 ${isDesktop ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <div className="glass-card-soft rounded-[20px] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">默认起点</p>
            <p className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">{dailyNewWordGoal} 个</p>
          </div>
          <div className="glass-card-soft rounded-[20px] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">复习周期</p>
            <p className="mt-1 text-[18px] font-semibold text-[var(--color-foreground)]">{reviewCycleDays} 天制</p>
          </div>
          <div className="glass-card-soft rounded-[20px] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">导入方式</p>
            <p className="mt-1 text-[13px] leading-5 text-[var(--color-foreground)]/80">添加时先定该词本每天新学，再导入到独立学习集。</p>
          </div>
        </div>

        <div className={`mb-4 flex gap-3 ${isDesktop ? 'items-center justify-between' : 'flex-col'}`}>
          <p className="text-[12px] leading-5 text-[var(--color-muted)]">
            全局默认只负责未分组词汇和新词本默认起点；真正的学习节奏在添加该词本时单独确定。
          </p>
          <button
            onClick={handleOpenWordbookPlan}
            className="glass-pill inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-3.5 py-2 text-[12px] font-semibold text-[var(--color-foreground)]"
          >
            全局学习设置
            <ChevronRight size={14} />
          </button>
        </div>

        {publicWordbooksError && (
          <div className="mb-4 rounded-[18px] bg-[var(--color-error)]/10 px-3 py-2 text-[12px] leading-5 text-[var(--color-error)]">
            {publicWordbooksError}
          </div>
        )}

        <div className={`${isDesktop ? 'max-h-[min(56dvh,620px)]' : 'max-h-[52dvh]'} overflow-y-auto overscroll-contain pr-1`}>
          {publicWordbooksLoading && (
            <div className="glass-card-soft flex h-[180px] items-center justify-center rounded-[24px] text-[13px] text-[var(--color-muted)]">
              词本加载中...
            </div>
          )}

          {!publicWordbooksLoading && publicWordbooks.length === 0 && !publicWordbooksError && (
            <div className="glass-card-soft rounded-[24px] px-4 py-5 text-[12px] leading-6 text-[var(--color-muted)]">
              暂时还没有可导入的公共词本，数据库同步后这里会自动出现。
            </div>
          )}

          <div className="space-y-3">
            {!publicWordbooksLoading && publicWordbooks.map((book) => {
              const imported = userWordbooks[book.id]
              const isImporting = importingWordbookId === book.id
              const tagList = (book.tags || []).slice(0, isDesktop ? 4 : 3)
              const planDailyGoal = imported?.vocab_set_id
                ? getSetDailyGoal(imported.vocab_set_id)
                : dailyNewWordGoal
              const estimate = getWordbookPacingEstimate(book.word_count, planDailyGoal, reviewCycleDays)
              return (
                <div key={book.id} className="glass-card-soft rounded-[24px] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[15px] font-semibold text-[var(--color-foreground)]">{book.title}</p>
                        <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
                          {getWordbookCategoryLabel(book)}
                        </span>
                      </div>
                      {book.subtitle && (
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">{book.subtitle}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[18px] font-bold text-[var(--color-foreground)]">{book.word_count}</p>
                      <p className="text-[11px] text-[var(--color-muted)]">词</p>
                    </div>
                  </div>

                  {book.description && (
                    <p className="mt-3 text-[13px] leading-6 text-[var(--color-muted)]">{book.description}</p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="glass-card-elevated rounded-[18px] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">首轮新学</p>
                      <p className="mt-1 text-[15px] font-semibold text-[var(--color-foreground)]">约 {estimate.firstPassDays} 天</p>
                    </div>
                    <div className="glass-card-elevated rounded-[18px] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">完整周期</p>
                      <p className="mt-1 text-[15px] font-semibold text-[var(--color-foreground)]">约 {estimate.masteryDays} 天</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] leading-5 text-[var(--color-muted)]">
                        {imported?.vocab_set_id
                          ? `当前词本计划：每天释放 ${planDailyGoal} 个新词，复习按 ${reviewCycleDays} 天制滚动安排`
                          : `添加时先制定该词本计划；当前默认起点为每天 ${planDailyGoal} 个新词。`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tagList.map((tag) => (
                          <span key={tag} className="glass-pill rounded-full px-2 py-1 text-[10px] font-medium text-[var(--color-muted)]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleWordbookAction(book)}
                      disabled={isImporting}
                      className={`shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold ${
                        imported?.vocab_set_id
                          ? 'glass-pill text-[var(--color-foreground)]'
                          : 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.2)]'
                      } disabled:opacity-60`}
                    >
                      {isImporting ? '导入中...' : imported?.vocab_set_id ? '查看学习集' : user ? '制定计划并添加' : '登录后添加'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )

  const wordbookImportPlannerModal = pendingWordbookImportPlan && pendingWordbookPacing && (
    <div
      className={`glass-modal-backdrop fixed inset-0 z-[60] ${isDesktop ? 'flex items-center justify-center p-6' : 'flex items-end'}`}
      onClick={closeWordbookImportPlanner}
    >
      <div
        className={isDesktop
          ? 'glass-modal-sheet glass-modal-sheet-desktop w-full max-w-[560px] overflow-hidden px-6 pb-6 pt-5'
          : 'glass-modal-sheet w-full overflow-hidden px-5 pb-8 pt-5'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">制定词本计划</h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">
              这个计划只作用于《{pendingWordbookImportPlan.book.title}》，不会影响其他学习集。
            </p>
          </div>
          <button onClick={closeWordbookImportPlanner}>
            <X size={18} className="text-[var(--color-muted)]" />
          </button>
        </div>

        <div className="glass-card-soft rounded-[22px] px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-[var(--color-foreground)]">
                {pendingWordbookImportPlan.book.title}
              </p>
              {pendingWordbookImportPlan.book.subtitle && (
                <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                  {pendingWordbookImportPlan.book.subtitle}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[18px] font-bold text-[var(--color-foreground)]">
                {pendingWordbookImportPlan.book.word_count}
              </p>
              <p className="text-[11px] text-[var(--color-muted)]">词</p>
            </div>
          </div>

          <div className="mt-4 mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-[var(--color-foreground)]">每日新词</span>
            <span className="text-[12px] font-semibold text-[var(--color-primary)]">
              {pendingWordbookDailyGoal} 个
            </span>
          </div>

          <div className="mb-3 grid grid-cols-4 gap-2">
            {DAILY_GOAL_PRESETS.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => applyPendingWordbookDailyGoal(goal)}
                className={`rounded-full py-2 text-[12px] font-medium transition-colors ${
                  pendingWordbookDailyGoal === goal
                    ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                    : 'glass-pill text-[var(--color-foreground)]'
                }`}
              >
                {goal}个
              </button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-[64px_minmax(0,1fr)_64px] gap-2">
            <button
              type="button"
              onClick={() => adjustPendingWordbookDailyGoal(-5)}
              className="glass-pill rounded-full py-2 text-[12px] font-medium text-[var(--color-foreground)]"
            >
              -5
            </button>
            <input
              type="number"
              min={1}
              max={999}
              step={1}
              inputMode="numeric"
              value={pendingWordbookImportPlan.dailyGoalDraft}
              onChange={(event) => setPendingWordbookImportPlan((current) => (
                current ? { ...current, dailyGoalDraft: event.target.value } : current
              ))}
              onBlur={() => applyPendingWordbookDailyGoal(pendingWordbookImportPlan.dailyGoalDraft)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              className="glass-input-shell rounded-full px-4 py-2 text-center text-[13px] font-semibold text-[var(--color-foreground)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => adjustPendingWordbookDailyGoal(5)}
              className="glass-pill rounded-full py-2 text-[12px] font-medium text-[var(--color-foreground)]"
            >
              +5
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="glass-card-elevated rounded-[18px] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">首轮新学</p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">
                约 {pendingWordbookPacing.firstPassDays} 天
              </p>
            </div>
            <div className="glass-card-elevated rounded-[18px] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">完整周期</p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">
                约 {pendingWordbookPacing.masteryDays} 天
              </p>
            </div>
          </div>

          <div className="glass-card-elevated mt-4 rounded-[18px] px-3 py-3 text-[12px] leading-5 text-[var(--color-muted)]">
            全局默认 {dailyNewWordGoal}/天 只用于未分组词汇和新词本默认起点；添加后这本词本会按你现在设定的节奏进入今日计划。
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeWordbookImportPlanner}
            className="glass-pill rounded-full px-4 py-2 text-[12px] font-semibold text-[var(--color-foreground)]"
          >
            稍后再说
          </button>
          <button
            type="button"
            onClick={handleConfirmWordbookImport}
            disabled={importingWordbookId === pendingWordbookImportPlan.book.id}
            className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_12px_24px_rgba(255,132,0,0.2)] disabled:opacity-60"
          >
            {importingWordbookId === pendingWordbookImportPlan.book.id ? '导入中...' : '制定计划并添加'}
          </button>
        </div>
      </div>
    </div>
  )

  if (isDesktop) {
    return (
      <div className="relative -mx-6 -my-4 min-h-full bg-[var(--color-background)] px-6 py-5">
        <div className="relative z-10 flex min-h-0 flex-col gap-5">
          <section className={`${glassPanel} rounded-[32px] p-6`}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="max-w-[720px]">
                  <h1 className="text-[32px] font-bold tracking-tight text-[var(--color-foreground)]">{activeSectionTitle}</h1>
                  <p className="mt-2 text-[13px] text-[var(--color-muted)]">{activeSectionSubtitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 xl:min-w-[320px]">
                  {activeSection === 'vocabulary' ? (
                    <>
                      <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Filtered</p>
                        <p className="mt-2 text-[28px] font-bold text-[var(--color-foreground)]">{filteredList.length}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">按当前筛选展示</p>
                      </div>
                      <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Mode</p>
                        <p className="mt-2 text-[17px] font-semibold text-[var(--color-foreground)]">{activeFilterLabel}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                          {activeFilter === 'today' ? '不会 = 今日释放 + 到期复习' : '当前词库筛选模式'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Sets</p>
                        <p className="mt-2 text-[28px] font-bold text-[var(--color-foreground)]">{customSets.length}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">独立学习节奏</p>
                      </div>
                      <div className={`${glassElevated} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Market</p>
                        <p className="mt-2 text-[28px] font-bold text-[var(--color-foreground)]">{publicWordbooks.length}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">可添加公共词本</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {sectionTabs.map((section) => {
                  const active = activeSection === section.key
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setActiveSection(section.key)}
                      className={`rounded-[26px] border px-5 py-4 text-left transition-all ${
                        active
                          ? 'selection-card-active'
                          : `${glassSoft} surface-hover border-white/45`
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[18px] font-semibold text-[var(--color-foreground)]">{section.label}</p>
                          <p className={`mt-1 text-[12px] ${active ? 'text-[var(--color-foreground)]/72' : 'text-[var(--color-muted)]'}`}>{section.subtitle}</p>
                        </div>
                        <ChevronRight size={18} className={active ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'} />
                      </div>
                    </button>
                  )
                })}
              </div>

              {activeSection === 'vocabulary' ? (
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
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
                        className="surface-hover-subtle rounded-full p-1 text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]"
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
                            : `${glassElevated} surface-hover text-[var(--color-foreground)]`
                        }`}
                      >
                        {t(lang, option.key)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={`${glassElevated} rounded-[24px] px-5 py-4 text-[13px] leading-6 text-[var(--color-muted)]`}>
                  词本加入后不会再一次性把所有单词挤进"不会"。现在"不会"只按各学习集的每日新词节奏释放，并叠加当天到期复习。
                </div>
              )}
            </div>
          </section>

          <section className={`${glassPanel} min-h-0 flex-1 rounded-[34px] p-4`}>
            {activeSection === 'vocabulary' ? (
              <div className="grid min-h-0 gap-4 xl:h-full xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-h-0 flex-col gap-4">
                  {searchResult && (
                    <div className={`${glassElevated} rounded-[28px] p-5`}>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[var(--color-primary)]">
                          <Sparkles size={15} />
                          <span className="text-[12px] font-semibold uppercase tracking-[0.16em]">{t(lang, 'vocab_ai_result')}</span>
                        </div>
                        <button onClick={() => setSearchResult(null)} className="surface-hover-subtle rounded-full p-1 text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
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
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-[18px] font-semibold text-[var(--color-foreground)]">词汇列表</h3>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                          当前显示 {filteredList.length} 个词，筛选为 {activeFilterLabel}
                        </p>
                      </div>
                      <div className={`${glassSoft} rounded-full px-3 py-1.5 text-[12px] text-[var(--color-muted)]`}>
                        {activeFilter === 'today' ? '不会按今日计划释放' : '实时同步收藏与掌握状态'}
                      </div>
                    </div>

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

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {!vocabLoading && filteredList.map((item) => (
                        <div
                          key={item.id}
                          className={`${listItemShell} surface-hover flex w-full items-center gap-4 rounded-[24px] px-4 py-4 text-left transition-all hover:-translate-y-0.5`}
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
                            <button className="surface-hover-subtle rounded-full p-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]" onClick={(e) => { e.stopPropagation(); speakAuto(item.word) }}>
                              <Volume2 size={16} />
                            </button>
                            <button className="surface-hover-subtle rounded-full p-2 transition-colors" onClick={(e) => { e.stopPropagation(); toggleStar(item.id) }}>
                              <Star size={16} className={item.starred ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : 'text-[#C6BBB1]'} />
                            </button>
                            <button
                              className="surface-hover-subtle rounded-full p-2 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMasteryClick(item)
                              }}
                              title={item.mastery_level >= 5 ? '查看已掌握状态' : '查看掌握进度'}
                            >
                              <BadgeCheck size={16} className={item.mastery_level >= 5 ? 'text-[#22C55E]' : 'text-[#C6BBB1]'} />
                            </button>
                            <button
                              className="surface-hover-subtle rounded-full p-2 text-[#C06B63] transition-colors hover:text-[#A53E34]"
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
                <div className={`${glassElevated} min-h-0 rounded-[28px] p-5`}>
                  <div className="flex h-full flex-col">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--color-muted)]">AI Detail</p>
                        <h3 className="mt-1 text-[20px] font-semibold text-[var(--color-foreground)]">词义深挖面板</h3>
                      </div>
                      {(selectedWord || detailError) && (
                        <button onClick={closeDetail} className="surface-hover-subtle rounded-full p-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
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
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--color-primary)]/14 text-[var(--color-primary)]">
                            <Sparkles size={24} />
                          </div>
                          <p className="text-[18px] font-semibold text-[var(--color-foreground)]">选一个单词开始</p>
                          <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)]">
                            这里固定展示音标、例句、助记和 AI 解释；左侧"不会"只显示按今日计划释放出来的词。
                          </p>
                        </div>
                        <div className="space-y-2 border-t border-[var(--color-border)] pt-4 text-[13px] text-[var(--color-muted)]">
                          <p>当前模式：{activeFilterLabel}</p>
                          <p>今日可见：{filteredList.length} 词</p>
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
            ) : (
              <div className="grid min-h-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
                <div className={`${glassElevated} flex min-h-0 flex-col overflow-hidden rounded-[28px] p-4`}>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-[18px] font-semibold text-[var(--color-foreground)]">自定义学习集</h3>
                      <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">把词组织进自己的复习节奏，再决定每天释放多少新词。</p>
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

                  {showCreateSetInput ? (
                    <div className={`${glassSoft} mb-4 rounded-[24px] border border-[var(--color-primary)]/35 px-4 py-4`}>
                      <p className="mb-2 text-[14px] font-semibold text-[var(--color-foreground)]">新增学习集</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newSetName}
                          onChange={(e) => setNewSetName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && newSetName.trim()) handleCreateSet() }}
                          placeholder="输入学习集名称"
                          autoFocus
                          className="flex-1 rounded-xl bg-[var(--color-background-secondary)] px-3 py-2 text-[14px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted)]"
                        />
                        <button
                          onClick={handleCreateSet}
                          disabled={!newSetName.trim() || setActionLoading}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white disabled:opacity-40"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => { setShowCreateSetInput(false); setNewSetName('') }}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-background-secondary)] text-[var(--color-muted)]"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className={`${glassSoft} mb-4 flex w-full items-center justify-between rounded-[24px] border border-dashed border-[var(--color-primary)]/35 px-4 py-4 text-left transition-transform hover:-translate-y-0.5`}
                      onClick={() => setShowCreateSetInput(true)}
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
                  )}

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
                              ? 'selection-card-active'
                              : `${glassSoft} surface-hover border-white/40 text-[var(--color-foreground)]`
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
                            <span className={selectedSetId === setItem.id ? 'text-[var(--color-foreground)]/80' : 'text-[var(--color-muted)]'}>{setItem.count} 词 · {setItem.dailyGoal}/天</span>
                            <span className={selectedSetId === setItem.id ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-light)]'}>
                              {new Date(setItem.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    className={`${glassSoft} mt-4 flex w-full items-center justify-between gap-3 rounded-[24px] p-4 text-left transition-transform hover:-translate-y-0.5`}
                    onClick={() => setIsWordbookMarketOpen(true)}
                  >
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--color-foreground)]">词本市场</p>
                      <p className="mt-1 text-[12px] text-[var(--color-muted)]">{publicWordbooks.length} 本</p>
                    </div>
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.2)]">
                      <BookOpen size={18} />
                    </div>
                  </button>

                  <button
                    className={`${glassSoft} mt-4 rounded-[24px] p-4 text-left transition-transform hover:-translate-y-0.5`}
                    onClick={() => navigate('/vocab-test')}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.2)]">
                          <Trophy size={20} />
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-[var(--color-muted)]" />
                    </div>
                    <p className="text-[17px] font-semibold text-[var(--color-foreground)]">{t(lang, 'vocab_test_title')}</p>
                    <p className="mt-1 text-[13px] leading-6 text-[var(--color-muted)]">{tf(lang, 'vocab_test_count', { count: vocabulary.length })}</p>
                  </button>
                </div>

                <div className={`${glassElevated} min-h-0 rounded-[28px] p-5`}>
                  <div className="flex h-full flex-col">
                    <div className="mb-4">
                      <p className="text-[12px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Study Flow</p>
                      <h3 className="mt-1 text-[22px] font-semibold text-[var(--color-foreground)]">学习集决定今天出现哪些"不会"</h3>
                      <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)]">
                        词本加入后先归到学习集里，只有按每日新词节奏释放出来的词，才会出现在词库"不会"视图中；不会再一上来全部塞进去。
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className={`${glassSoft} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">学习集</p>
                        <p className="mt-2 text-[24px] font-bold text-[var(--color-foreground)]">{customSets.length}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">独立节奏管理</p>
                      </div>
                      <div className={`${glassSoft} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">全局默认</p>
                        <p className="mt-2 text-[24px] font-bold text-[var(--color-foreground)]">{dailyNewWordGoal}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">未分组词汇 / 新词本起点</p>
                      </div>
                      <div className={`${glassSoft} rounded-[22px] px-4 py-3`}>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">复习周期</p>
                        <p className="mt-2 text-[24px] font-bold text-[var(--color-foreground)]">{reviewCycleDays}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">天制滚动复习</p>
                      </div>
                    </div>

                    <div className={`${glassSoft} mt-4 rounded-[26px] p-5`}>
                      {selectedSet ? (
                        <>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--color-muted)]">当前学习集</p>
                              <h4 className="mt-1 text-[22px] font-semibold text-[var(--color-foreground)]">{selectedSet.name}</h4>
                              <p className="mt-2 text-[13px] text-[var(--color-muted)]">
                                {selectedSet.count} 词 · 每天释放 {selectedSet.dailyGoal} 个新词
                                {selectedSetIsImported ? ' · 公共词本' : ' · 自定义学习集'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenSetModal(selectedSet.id)}
                                className="glass-pill rounded-full px-4 py-2 text-[12px] font-semibold text-[var(--color-foreground)]"
                              >
                                管理学习集
                              </button>
                              <button
                                type="button"
                                onClick={handleStartSetStudy}
                                className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_12px_24px_rgba(255,132,0,0.2)]"
                              >
                                开始学习
                              </button>
                            </div>
                          </div>

                          {selectedSetPacing && (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="glass-card-elevated rounded-[20px] px-4 py-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">首轮新学</p>
                                <p className="mt-1 text-[16px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.firstPassDays} 天</p>
                              </div>
                              <div className="glass-card-elevated rounded-[20px] px-4 py-3">
                                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">完整周期</p>
                                <p className="mt-1 text-[16px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.masteryDays} 天</p>
                              </div>
                            </div>
                          )}

                          <p className="mt-4 text-[13px] leading-6 text-[var(--color-muted)]">
                            这个学习集里的单词不会全部挤进词库默认视图；词库里的"不会"只显示按计划释放的新词与当天到期复习。
                          </p>
                        </>
                      ) : (
                        <div className="flex h-full min-h-[220px] flex-col justify-center">
                          <p className="text-[18px] font-semibold text-[var(--color-foreground)]">先选一个学习集</p>
                          <p className="mt-2 text-[13px] leading-6 text-[var(--color-muted)]">
                            选中后就能查看节奏、调整每天新词数量，或者直接进入该学习集的闪卡流程。
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 min-h-0 flex-1 border-t border-[var(--color-border)] pt-5">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Preview</p>
                          <p className="mt-1 text-[16px] font-semibold text-[var(--color-foreground)]">当前学习集预览</p>
                        </div>
                        <span className="text-[12px] text-[var(--color-muted)]">{setWords.length} 词</span>
                      </div>
                      {selectedSetPreviewWords.length > 0 ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {selectedSetPreviewWords.map((item) => (
                            <div key={item.id} className="glass-card-elevated rounded-[18px] px-4 py-3">
                              <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{item.word}</p>
                              <p className="mt-1 text-[12px] text-[var(--color-muted)]">{item.phonetic || 'English'}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-2 py-4 text-[13px] leading-6 text-[var(--color-muted)]">
                          {selectedSet
                            ? '当前学习集还没有预览单词，可从学习集管理中查看完整词表。'
                            : '选择学习集后，这里会显示一组词条预览。'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {wordbookMarketModal}
        {wordbookImportPlannerModal}

        {isSetModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#6f4b22]/18 p-8 backdrop-blur-md"
            onClick={() => setIsSetModalOpen(false)}
          >
            <div
              className={`${glassPanel} w-full max-w-[760px] max-h-[calc(100dvh-64px)] overflow-y-auto rounded-[32px] px-7 pb-7 pt-6`}
              style={{ WebkitBackdropFilter: 'blur(26px) saturate(1.55)', backdropFilter: 'blur(26px) saturate(1.55)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-[22px] font-bold text-[var(--color-foreground)]">学习集管理</h3>
                  <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                    {selectedSetIsImported
                      ? '公共词本只开放学习节奏调整，标题和词表内容保持锁定。'
                      : '保持功能不变，但把操作都收进玻璃弹层。'}
                  </p>
                </div>
                <button onClick={() => setIsSetModalOpen(false)} className="surface-hover-subtle rounded-full p-2 text-[var(--color-muted)] transition-colors hover:text-[var(--color-foreground)]">
                  <X size={18} />
                </button>
              </div>

              <div className={`${glassSoft} mb-5 rounded-[24px] px-4 py-4`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-[var(--color-muted)]">该学习集计划</p>
                    <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">只影响当前词本，不会联动其他学习集</p>
                  </div>
                  <button
                    onClick={handleStartSetStudy}
                    disabled={!selectedSetId}
                    className="rounded-full bg-[#FF8400] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_14px_28px_rgba(255,132,0,0.24)] disabled:opacity-50"
                  >
                    开始学习
                  </button>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[var(--color-foreground)]">每日新词</span>
                  <span className="text-[12px] text-[var(--color-primary)]">{selectedSet?.dailyGoal || dailyNewWordGoal} 个</span>
                </div>

                <div className="mb-3 grid grid-cols-4 gap-2.5">
                  {DAILY_GOAL_PRESETS.map((goal) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => applySelectedSetDailyGoal(goal)}
                      className={`rounded-full py-2 text-[12px] font-medium transition-colors ${
                        (selectedSet?.dailyGoal || dailyNewWordGoal) === goal
                          ? 'bg-[#FF8400] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                          : 'glass-pill text-[var(--color-foreground)]'
                      }`}
                    >
                      {goal}个
                    </button>
                  ))}
                </div>

                <div className="mb-3 grid grid-cols-[64px_minmax(0,1fr)_64px] gap-2.5">
                  <button
                    type="button"
                    onClick={() => adjustSelectedSetDailyGoal(-5)}
                    className="glass-pill rounded-full py-2 text-[12px] font-medium text-[var(--color-foreground)]"
                  >
                    -5
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    inputMode="numeric"
                    value={selectedSetDailyGoalDraft}
                    onChange={(event) => setSelectedSetDailyGoalDraft(event.target.value)}
                    onBlur={() => applySelectedSetDailyGoal(selectedSetDailyGoalDraft)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur()
                      }
                    }}
                    className="glass-input-shell rounded-full px-4 py-2 text-center text-[13px] font-semibold text-[var(--color-foreground)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => adjustSelectedSetDailyGoal(5)}
                    className="glass-pill rounded-full py-2 text-[12px] font-medium text-[var(--color-foreground)]"
                  >
                    +5
                  </button>
                </div>

                {selectedSetPacing && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="glass-card-elevated rounded-[18px] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">首轮新学</p>
                      <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.firstPassDays} 天</p>
                    </div>
                    <div className="glass-card-elevated rounded-[18px] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">完整周期</p>
                      <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.masteryDays} 天</p>
                    </div>
                  </div>
                )}
              </div>

              {!selectedSetIsImported && (
                <>
                  <div className="mb-5">
                    <label className="mb-2 block text-[12px] uppercase tracking-[0.16em] text-[var(--color-muted)]">文件夹名称</label>
                    <div className="flex items-center gap-3">
                      <input
                        value={setNameInput}
                        onChange={(e) => setSetNameInput(e.target.value)}
                        className="glass-input-shell flex-1 rounded-[20px] px-4 py-3 text-[14px] text-[var(--color-foreground)] outline-none"
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
                    <label className="mb-2 block text-[12px] uppercase tracking-[0.16em] text-[var(--color-muted)]">批量添加单词</label>
                    <textarea
                      value={batchWordsInput}
                      onChange={(e) => setBatchWordsInput(e.target.value)}
                      placeholder="可粘贴多行，支持空格/逗号/换行自动分词"
                      rows={5}
                      className="glass-input-shell w-full rounded-[24px] px-4 py-3 text-[14px] text-[var(--color-foreground)] outline-none resize-none"
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
                </>
              )}

              <div>
                <p className="mb-3 text-[12px] uppercase tracking-[0.16em] text-[var(--color-muted)]">当前学习集单词（{setWords.length}）</p>
                <div className={`${glassSoft} max-h-[320px] overflow-y-auto rounded-[24px] p-2`}>
                  {setWords.length === 0 && (
                    <p className="px-3 py-4 text-[13px] text-[var(--color-muted)]">
                      {selectedSetIsImported ? '当前公共词本暂时还没有同步出单词。' : '还没有单词，先批量添加一组。'}
                    </p>
                  )}
                  {setWords.map((item) => (
                    <div key={item.id} className="glass-card-elevated mb-2 rounded-[18px] px-3 py-3 text-[var(--color-foreground)] last:mb-0">
                      <p className="text-[14px] font-medium">
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
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-hidden bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="relative z-10 px-5 pt-5">
        <div className="glass-card-strong rounded-[30px] px-5 py-5">
          <h1 className="text-[24px] font-bold text-[var(--color-foreground)] font-secondary">{activeSectionTitle}</h1>
          <p className="text-[12px] text-[var(--color-muted)] mt-1">
            {activeSectionSubtitle}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="glass-card-elevated rounded-[20px] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                {activeSection === 'vocabulary' ? 'Filtered' : 'Sets'}
              </p>
              <p className="mt-1 text-[20px] font-bold text-[var(--color-foreground)]">
                {activeSection === 'vocabulary' ? filteredList.length : customSets.length}
              </p>
            </div>
            <div className="glass-card-elevated rounded-[20px] px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
                {activeSection === 'vocabulary' ? 'Mode' : 'Pacing'}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">
                {activeSection === 'vocabulary' ? activeFilterLabel : '独立节奏'}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {sectionTabs.map((section) => {
              const active = activeSection === section.key
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={`rounded-[20px] px-4 py-3 text-left transition-all ${
                    active
                      ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.22)]'
                      : 'glass-card-elevated text-[var(--color-foreground)]'
                  }`}
                >
                  <p className="text-[15px] font-semibold">{section.label}</p>
                  <p className={`mt-1 text-[11px] ${active ? 'text-white/85' : 'text-[var(--color-muted)]'}`}>{section.subtitle}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeSection === 'vocabulary' && (
        <>
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
        </>
      )}

      {activeSection === 'sets' && (
        <>
          {/* ===== 自定义学习集 ===== */}
          <div className="relative z-10 mx-5 mt-4">
            <div className="glass-card-strong rounded-[28px] p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">自定义学习集</h3>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={`inline-flex h-9 min-w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-[16px] px-3 text-[12px] font-semibold whitespace-nowrap ${
                      setSortMode === 'time' ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_24px_rgba(255,132,0,0.24)]' : 'glass-pill text-[var(--color-muted)]'
                    }`}
                    onClick={() => setSetSortMode('time')}
                  >
                    <Clock3 size={12} /> 时间
                  </button>
                  <button
                    className={`inline-flex h-9 min-w-[72px] shrink-0 items-center justify-center gap-1.5 rounded-[16px] px-3 text-[12px] font-semibold whitespace-nowrap ${
                      setSortMode === 'name' ? 'bg-[var(--color-primary)] text-white shadow-[0_10px_24px_rgba(255,132,0,0.24)]' : 'glass-pill text-[var(--color-muted)]'
                    }`}
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
                      selectedSetId === setItem.id ? 'selection-card-active' : 'glass-card-soft text-[var(--color-foreground)]'
                    }`}
                    onClick={() => handleOpenSetModal(setItem.id)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <FolderOpen size={14} className={selectedSetId === setItem.id ? 'text-[var(--color-primary)]' : undefined} />
                      <span className="text-[12px] font-semibold truncate">{setItem.name}</span>
                    </div>
                    <p className={`text-[11px] ${selectedSetId === setItem.id ? 'text-[var(--color-foreground)]/72' : 'text-[var(--color-muted)]'}`}>
                      {setItem.count} 词 · {setItem.dailyGoal}/天
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 mx-5 mt-4">
            <div className="glass-card-strong rounded-[28px] p-4">
              <h3 className="text-[16px] font-semibold text-[var(--color-foreground)]">今日释放规则</h3>
              <p className="mt-2 text-[12px] leading-6 text-[var(--color-muted)]">
                学习集里的单词不会一次性全部进入"不会"。词库页默认只显示：今天按计划释放的新词 + 今天到期复习的词。
              </p>

              {selectedSet && (
                <div className="glass-card-soft mt-3 rounded-[20px] p-3">
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{selectedSet.name}</p>
                  <p className="mt-1 text-[12px] text-[var(--color-muted)]">{selectedSet.count} 词 · {selectedSet.dailyGoal}/天</p>
                  {selectedSetPacing && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="glass-card-elevated rounded-[16px] px-3 py-2">
                        <p className="text-[10px] text-[var(--color-muted)]">首轮新学</p>
                        <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.firstPassDays} 天</p>
                      </div>
                      <div className="glass-card-elevated rounded-[16px] px-3 py-2">
                        <p className="text-[10px] text-[var(--color-muted)]">完整周期</p>
                        <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.masteryDays} 天</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="relative z-10 mx-5 mt-4">
            <button
              className="glass-card-strong flex w-full items-center justify-between gap-3 rounded-[28px] p-4 text-left"
              onClick={() => setIsWordbookMarketOpen(true)}
            >
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-[var(--color-foreground)]">词本市场</h3>
                <p className="mt-1 text-[12px] text-[var(--color-muted)]">{publicWordbooks.length} 本</p>
              </div>
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.24)]">
                <BookOpen size={20} />
              </div>
            </button>
          </div>

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
        </>
      )}

      {/* ===== 词汇列表 ===== */}
      {activeSection === 'vocabulary' && (
        <div className="relative z-10 flex-1 overflow-y-auto pl-3 pr-5 mt-4 pb-6">
          <div className="glass-card-strong rounded-[28px] pl-3 pr-4 py-4">
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
                    className={`${listItemShell} relative z-10 flex items-center gap-3 rounded-[24px] pl-2.5 pr-3.5 py-3.5 transition-transform duration-150 active:bg-[var(--color-background-secondary)]/50`}
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
      )}

      {wordbookMarketModal}
      {wordbookImportPlannerModal}

      {/* ===== 学习集管理弹窗 ===== */}
      {isSetModalOpen && (
        <div
          className={`glass-modal-backdrop fixed inset-0 z-50 ${isDesktop ? 'flex items-center justify-center p-6' : 'flex items-end'}`}
          onClick={() => setIsSetModalOpen(false)}
        >
          <div
            className={isDesktop
              ? 'glass-modal-sheet glass-modal-sheet-desktop w-full max-w-[680px] max-h-[82dvh] overflow-y-auto px-6 pb-6 pt-5'
              : 'glass-modal-sheet w-full max-h-[78dvh] overflow-y-auto px-5 pb-8 pt-5'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[18px] font-bold text-[var(--color-foreground)]">学习集管理</h3>
                <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                  {selectedSetIsImported
                    ? '公共词本只开放学习节奏调整，标题和词表内容保持锁定。'
                    : '自定义学习集可继续改名和追加单词。'}
                </p>
              </div>
              <button onClick={() => setIsSetModalOpen(false)}>
                <X size={18} className="text-[var(--color-muted)]" />
              </button>
            </div>

            <div className="glass-card-soft rounded-[18px] px-4 py-4 mb-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] text-[var(--color-muted)]">该学习集计划</p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--color-foreground)]">只影响当前词本，不会联动其他学习集</p>
                </div>
                <button
                  onClick={handleStartSetStudy}
                  disabled={!selectedSetId}
                  className="px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[12px] font-semibold disabled:opacity-50"
                >
                  开始学习
                </button>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--color-foreground)]">每日新词</span>
                <span className="text-[12px] text-[var(--color-primary)]">{selectedSet?.dailyGoal || dailyNewWordGoal} 个</span>
              </div>

              <div className="mb-3 grid grid-cols-4 gap-2">
                {DAILY_GOAL_PRESETS.map((goal) => (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => applySelectedSetDailyGoal(goal)}
                    className={`rounded-full py-2 text-[12px] font-medium transition-colors ${
                      (selectedSet?.dailyGoal || dailyNewWordGoal) === goal
                        ? 'bg-[var(--color-primary)] text-white shadow-[0_12px_24px_rgba(255,132,0,0.18)]'
                        : 'glass-pill text-[var(--color-foreground)]'
                    }`}
                  >
                    {goal}个
                  </button>
                ))}
              </div>

              <div className="mb-3 grid grid-cols-[64px_minmax(0,1fr)_64px] gap-2">
                <button
                  type="button"
                  onClick={() => adjustSelectedSetDailyGoal(-5)}
                  className="glass-pill rounded-full py-2 text-[12px] font-medium text-[var(--color-foreground)]"
                >
                  -5
                </button>
                <input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  inputMode="numeric"
                  value={selectedSetDailyGoalDraft}
                  onChange={(event) => setSelectedSetDailyGoalDraft(event.target.value)}
                  onBlur={() => applySelectedSetDailyGoal(selectedSetDailyGoalDraft)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur()
                    }
                  }}
                  className="glass-input-shell rounded-full px-4 py-2 text-center text-[13px] font-semibold text-[var(--color-foreground)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => adjustSelectedSetDailyGoal(5)}
                  className="glass-pill rounded-full py-2 text-[12px] font-medium text-[var(--color-foreground)]"
                >
                  +5
                </button>
              </div>

              {selectedSetPacing && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="glass-card-elevated rounded-[16px] px-3 py-2">
                    <p className="text-[10px] text-[var(--color-muted)]">首轮新学</p>
                    <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.firstPassDays} 天</p>
                  </div>
                  <div className="glass-card-elevated rounded-[16px] px-3 py-2">
                    <p className="text-[10px] text-[var(--color-muted)]">完整周期</p>
                    <p className="mt-1 text-[13px] font-semibold text-[var(--color-foreground)]">约 {selectedSetPacing.masteryDays} 天</p>
                  </div>
                </div>
              )}
            </div>

            {!selectedSetIsImported && (
              <>
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
              </>
            )}

            <div>
              <p className="text-[12px] text-[var(--color-muted)] mb-2">当前学习集单词（{setWords.length}）</p>
              <div className="glass-card-soft max-h-[260px] overflow-y-auto rounded-[18px]">
                {setWords.length === 0 && (
                  <p className="text-[13px] text-[var(--color-muted)] p-3">
                    {selectedSetIsImported ? '当前公共词本暂时还没有同步出单词。' : '还没有单词，先批量添加一组。'}
                  </p>
                )}
                {setWords.map((item) => (
                  <div key={item.id} className="px-3 py-2 border-b border-[var(--glass-border)] last:border-b-0">
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
