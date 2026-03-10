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

// 新词汇的输入参数类型
export interface AddWordInput {
  word: string
  phonetic?: string
  meaning?: string
  example_sentence?: string
  source?: 'translate' | 'reading' | 'manual' | 'test' | 'ai'
}

// 筛选条件
export type VocabFilter = 'all' | 'starred' | 'ai_classify'

export function useVocabulary() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<VocabFilter>('all')

  // ===== 读取词汇列表（React Query 自动缓存） =====
  const {
    data: vocabulary = [],
    isLoading: loading,
    error: queryError,
  } = useQuery<UserVocabulary[]>({
    queryKey: ['vocabulary', user?.id, filter],
    queryFn: async () => {
      if (!user) return []

      let query = supabase
        .from('user_vocabulary')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (filter === 'starred') {
        query = query.eq('starred', true)
      }
      if (filter === 'ai_classify') {
        query = query.not('scene_tags', 'is', null)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data || []
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

      const { data, error: err } = await supabase
        .from('user_vocabulary')
        .upsert(
          {
            user_id: user.id,
            word: input.word.toLowerCase().trim(),
            phonetic: input.phonetic || null,
            meaning: input.meaning || null,
            example_sentence: input.example_sentence || null,
            source: input.source || 'manual',
          },
          { onConflict: 'user_id,word' }
        )
        .select()
        .single()

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

      const rows = words.map(w => ({
        user_id: user.id,
        word: w.word.toLowerCase().trim(),
        phonetic: w.phonetic || null,
        meaning: w.meaning || null,
        example_sentence: w.example_sentence || null,
        source: w.source || 'translate',
      }))

      const { error: err } = await supabase
        .from('user_vocabulary')
        .upsert(rows, { onConflict: 'user_id,word' })

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
    async (id: number, nextReviewAt: string, reviewCount: number, masteryLevel: number) => {
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
  }
}
