/**
 * useVocabulary - 用户词汇表管理 hook（React Query 版）
 *
 * 功能：
 * 1. fetchVocabulary(filter) - 读取用户词汇列表（带缓存）
 * 2. addWord(word) - 添加新词汇
 * 3. addWords(words) - 批量添加词汇
 * 4. toggleStar(id) - 切换收藏状态
 * 5. deleteWord(id) - 删除词汇
 * 6. updateMastery(id, level) - 更新熟练度
 *
 * 缓存策略：
 *   - queryKey: ['vocabulary', userId, filter]
 *   - staleTime: 5 分钟
 *
 * 依赖：
 * - 必须在 <AuthProvider> + <QueryClientProvider> 内部使用
 */

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type UserVocabulary } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { normalizeVocabWord } from '../lib/text'
import { isValidLearnableWord } from '../lib/vocabularyFilter'
import { getDailyNewWordGoal } from '../lib/learnSettings'
import { buildTodayStudyQueue } from '../lib/vocabStudyQueue'
import { buildAggregatedTodayStudyQueue, fetchUserVocabPlanningContext } from '../lib/vocabTodayPlanner'
import {
  markVocabularySchemaLegacy,
  markVocabularySchemaModern,
  rememberVocabularySchemaModeFromRows,
  shouldUseLegacyVocabularySchema,
} from '../lib/vocabularySchema'

// 新词汇的输入参数类型
export interface AddWordInput {
  word: string
  language_code?: string
  language_label?: string
  phonetic?: string
  meaning?: string
  example_sentence?: string
  source?: 'translate' | 'reading' | 'manual' | 'test' | 'ai'
}

interface BulkReviewInput {
  vocabularyId: number
  result: 'known' | 'fuzzy' | 'unknown'
  reviewType: string
}

interface BulkNextReviewInput {
  id: number
  nextReviewAt: string | null
  reviewCount: number
  masteryLevel: number
}

// 筛选条件
export type VocabFilter =
  | 'all'
  | 'new'
  | 'mastered'
  | 'starred'
  | 'ai_classify'
  | 'due'
  | 'today'

function normalizeLanguageCode(languageCode?: string) {
  const value = String(languageCode || '').trim().toLowerCase()
  if (!value) return 'en'
  if (value === 'zh' || value === 'zh-cn' || value === 'zh-hans') return 'zh-CN'
  if (value === 'zh-tw' || value === 'zh-hk' || value === 'zh-hant') return 'zh-TW'
  if (value === 'ja' || value === 'ja-jp') return 'ja'
  if (value === 'ko' || value === 'ko-kr') return 'ko'
  if (value === 'en' || value.startsWith('en-')) return 'en'
  return languageCode?.trim() || 'en'
}

function normalizeLanguageLabel(languageLabel?: string, languageCode?: string) {
  const label = String(languageLabel || '').trim()
  if (label) return label

  const normalizedCode = normalizeLanguageCode(languageCode).toLowerCase()
  if (normalizedCode === 'zh' || normalizedCode === 'zh-cn') return '简中'
  if (normalizedCode === 'zh-tw' || normalizedCode === 'zh-hk') return '繁中'
  if (normalizedCode === 'ja') return '日本語'
  if (normalizedCode === 'ko') return '한국어'
  return 'English'
}

function buildVocabularyRow(userId: string, input: AddWordInput) {
  const languageCode = normalizeLanguageCode(input.language_code)
  return {
    user_id: userId,
    word: normalizeVocabWord(input.word),
    language_code: languageCode,
    language_label: normalizeLanguageLabel(input.language_label, languageCode),
    phonetic: input.phonetic || null,
    meaning: input.meaning || null,
    example_sentence: input.example_sentence || null,
    source: input.source || 'manual',
  }
}

function isVocabularyLanguageSchemaMissing(message: string) {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('language_code')
    || normalized.includes('language_label')
    || normalized.includes('user_id,word,language_code')
}

function shouldFilterAutoCollectedWord(source?: AddWordInput['source']) {
  return source === 'translate' || source === 'reading' || source === 'ai'
}

export function useVocabulary() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<VocabFilter>('new')
  const dailyNewWordGoal = getDailyNewWordGoal()

  // ===== 读取词汇列表（React Query 自动缓存） =====
  const {
    data: vocabulary = [],
    isLoading: loading,
    error: queryError,
  } = useQuery<UserVocabulary[]>({
    queryKey: ['vocabulary', user?.id, filter, filter === 'today' ? dailyNewWordGoal : null],
    queryFn: async () => {
      if (!user) return []

      let query = supabase
        .from('user_vocabulary')
        .select('*')
        .eq('user_id', user.id)

      if (filter === 'starred') {
        query = query.eq('starred', true)
      }
      if (filter === 'mastered') {
        query = query.gte('mastery_level', 5)
      }
      if (filter === 'ai_classify') {
        query = query.not('scene_tags', 'is', null)
      }
      if (filter === 'new') {
        // “不会/未掌握”：所有尚未完成艾宾浩斯周期的词
        query = query.lt('mastery_level', 5)
      }
      if (filter === 'due') {
        const nowIso = new Date().toISOString()
        query = query
          .lt('mastery_level', 5)
          .or(`next_review_at.is.null,next_review_at.lte.${nowIso}`)
          .order('next_review_at', { ascending: true, nullsFirst: true })
          .order('created_at', { ascending: false })
      } else if (filter === 'today') {
        query = query
          .lt('mastery_level', 5)
          .order('review_count', { ascending: true })
          .order('next_review_at', { ascending: true, nullsFirst: true })
          .order('created_at', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const rows = data || []
      rememberVocabularySchemaModeFromRows(rows as Array<Record<string, unknown>>)
      if (filter !== 'today') return rows

      try {
        const planningContext = await fetchUserVocabPlanningContext(user.id, dailyNewWordGoal)
        return buildAggregatedTodayStudyQueue(rows, {
          inboxDailyGoal: dailyNewWordGoal,
          setPlans: planningContext.setPlans,
          memberships: planningContext.memberships,
          inboxLabel: '未分组词汇',
        }).queue
      } catch {
        return buildTodayStudyQueue(rows, dailyNewWordGoal).queue
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })

  // ===== 手动切换筛选（触发新的查询） =====
  const fetchVocabulary = useCallback(
    async (newFilter: VocabFilter = 'all') => {
      setFilter(newFilter)
      // React Query 会自动根据新的 filter 重新查询
    },
    []
  )

  // ===== 使词汇缓存失效（增删改后调用） =====
  const invalidateVocab = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vocabulary', user?.id] })
  }, [queryClient, user?.id])

  // ===== 添加单个词汇 =====
  const addWord = useCallback(
    async (input: AddWordInput) => {
      if (!user) return { error: '未登录' }
      if (shouldFilterAutoCollectedWord(input.source) && !isValidLearnableWord(input.word, input.meaning)) {
        return { error: '该词不适合收录：已过滤专有名词、缩写、网络用语或异常词形' }
      }

      const nextRow = buildVocabularyRow(user.id, input)

      let data = null
      let err = null as { message: string } | null

      if (!shouldUseLegacyVocabularySchema()) {
        const nextResult = await supabase
          .from('user_vocabulary')
          .upsert(nextRow, { onConflict: 'user_id,word,language_code' })
          .select()
          .single()

        data = nextResult.data
        err = nextResult.error
      }

      if (shouldUseLegacyVocabularySchema() || (err && isVocabularyLanguageSchemaMissing(err.message))) {
        if (err && isVocabularyLanguageSchemaMissing(err.message)) {
          markVocabularySchemaLegacy()
        }

        const legacyResult = await supabase
          .from('user_vocabulary')
          .upsert(
            {
              user_id: user.id,
              word: normalizeVocabWord(input.word),
              phonetic: input.phonetic || null,
              meaning: input.meaning || null,
              example_sentence: input.example_sentence || null,
              source: input.source || 'manual',
            },
            { onConflict: 'user_id,word' }
          )
          .select()
          .single()

        data = legacyResult.data
        err = legacyResult.error
      } else if (!err) {
        markVocabularySchemaModern()
      }

      if (err) {
        console.error('添加词汇失败:', err.message)
        return { error: err.message }
      }

      invalidateVocab()
      return { error: null, data }
    },
    [user, invalidateVocab]
  )

  // ===== 批量添加词汇 =====
  const addWords = useCallback(
    async (words: AddWordInput[]) => {
      if (!user || words.length === 0) return { error: '无词汇可添加' }

      const validWords = words.filter((word) => !shouldFilterAutoCollectedWord(word.source) || isValidLearnableWord(word.word, word.meaning))
      if (validWords.length === 0) {
        return { error: '无可收录词汇：候选词均被过滤' }
      }

      const rows = validWords.map((word) => buildVocabularyRow(user.id, {
        ...word,
        source: word.source || 'translate',
      }))

      let err = null as { message: string } | null

      if (!shouldUseLegacyVocabularySchema()) {
        const nextResult = await supabase
          .from('user_vocabulary')
          .upsert(rows, { onConflict: 'user_id,word,language_code' })

        err = nextResult.error
      }

      if (shouldUseLegacyVocabularySchema() || (err && isVocabularyLanguageSchemaMissing(err.message))) {
        if (err && isVocabularyLanguageSchemaMissing(err.message)) {
          markVocabularySchemaLegacy()
        }

        const legacyRows = validWords.map((word) => ({
          user_id: user.id,
          word: normalizeVocabWord(word.word),
          phonetic: word.phonetic || null,
          meaning: word.meaning || null,
          example_sentence: word.example_sentence || null,
          source: word.source || 'translate',
        }))

        const legacyResult = await supabase
          .from('user_vocabulary')
          .upsert(legacyRows, { onConflict: 'user_id,word' })

        err = legacyResult.error
      } else if (!err) {
        markVocabularySchemaModern()
      }

      if (err) {
        console.error('批量添加失败:', err.message)
        return { error: err.message }
      }

      invalidateVocab()
      return { error: null }
    },
    [user, invalidateVocab]
  )

  // ===== 切换收藏（乐观更新） =====
  const toggleStar = useCallback(
    async (id: number) => {
      const item = vocabulary.find(v => v.id === id)
      if (!item) return

      const newStarred = !item.starred

      // 乐观更新缓存
      queryClient.setQueryData<UserVocabulary[]>(
        ['vocabulary', user?.id, filter],
        (old) => old?.map(v => v.id === id ? { ...v, starred: newStarred } : v) || []
      )

      const { error: err } = await supabase
        .from('user_vocabulary')
        .update({ starred: newStarred })
        .eq('id', id)

      if (err) invalidateVocab() // 如果失败，重新拉取
    },
    [vocabulary, user?.id, filter, queryClient, invalidateVocab]
  )

  // ===== 删除词汇 =====
  const deleteWord = useCallback(
    async (id: number) => {
      // 乐观更新
      queryClient.setQueryData<UserVocabulary[]>(
        ['vocabulary', user?.id, filter],
        (old) => old?.filter(v => v.id !== id) || []
      )

      const { error: err } = await supabase
        .from('user_vocabulary')
        .delete()
        .eq('id', id)

      if (err) invalidateVocab()
    },
    [user?.id, filter, queryClient, invalidateVocab]
  )

  // ===== 更新熟练度 =====
  const updateMastery = useCallback(
    async (id: number, level: number) => {
      const { error: err } = await supabase
        .from('user_vocabulary')
        .update({ mastery_level: Math.min(5, Math.max(0, level)) })
        .eq('id', id)

      if (!err) invalidateVocab()
    },
    [invalidateVocab]
  )

  // ===== 更新下次复习时间（艾宾浩斯） =====
  const updateNextReview = useCallback(
    async (id: number, nextReviewAt: string | null, reviewCount: number, masteryLevel: number) => {
      const { error: err } = await supabase
        .from('user_vocabulary')
        .update({
          next_review_at: nextReviewAt,
          review_count: reviewCount,
          mastery_level: masteryLevel,
        })
        .eq('id', id)

      if (!err) invalidateVocab()
    },
    [invalidateVocab]
  )

  // ===== 写入复习记录 =====
  const addReview = useCallback(
    async (vocabularyId: number, result: 'known' | 'fuzzy' | 'unknown', reviewType: string) => {
      if (!user) return
      await supabase.from('vocabulary_reviews').insert({
        user_id: user.id,
        vocabulary_id: vocabularyId,
        result,
        review_type: reviewType,
      })
    },
    [user]
  )

  // ===== 批量写入复习记录 =====
  const addReviewsBulk = useCallback(
    async (items: BulkReviewInput[]) => {
      if (!user || items.length === 0) return
      const rows = items.map(item => ({
        user_id: user.id,
        vocabulary_id: item.vocabularyId,
        result: item.result,
        review_type: item.reviewType,
      }))
      const { error: err } = await supabase.from('vocabulary_reviews').insert(rows)
      if (err) {
        console.error('批量写入复习记录失败:', err.message)
      }
    },
    [user]
  )

  // ===== 批量更新下次复习时间 =====
  const updateNextReviewBulk = useCallback(
    async (items: BulkNextReviewInput[]) => {
      if (!user || items.length === 0) return
      const results = await Promise.all(
        items.map(async (item) => {
          const { error } = await supabase
            .from('user_vocabulary')
            .update({
              next_review_at: item.nextReviewAt,
              review_count: item.reviewCount,
              mastery_level: item.masteryLevel,
            })
            .eq('id', item.id)
            .eq('user_id', user.id)
          return error
        })
      )

      const firstError = results.find(Boolean)
      if (firstError) {
        console.error('批量更新复习进度失败:', firstError.message)
        return
      }

      invalidateVocab()
    },
    [user, invalidateVocab]
  )

  return {
    vocabulary,
    loading,
    error: queryError ? (queryError as Error).message : null,
    fetchVocabulary,
    addWord,
    addWords,
    toggleStar,
    deleteWord,
    updateMastery,
    updateNextReview,
    addReview,
    addReviewsBulk,
    updateNextReviewBulk,
  }
}
