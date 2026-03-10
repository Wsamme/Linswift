/**
 * useTranslations - 翻译历史管理 hook
 *
 * 功能：
 * 1. fetchHistory() - 获取翻译历史
 * 2. saveTranslation() - 保存翻译记录
 * 3. toggleStar() - 切换收藏
 * 4. deleteTranslation() - 删除记录
 *
 * 依赖：
 * - 需要 user_translations 表已创建
 */

import { useState, useCallback } from 'react'
import { supabase, type UserTranslation } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useTranslations() {
  const { user } = useAuth()
  const [history, setHistory] = useState<UserTranslation[]>([])
  const [loading, setLoading] = useState(false)

  // ===== 获取翻译历史 =====
  const fetchHistory = useCallback(
    async (limit: number = 20) => {
      if (!user) return
      setLoading(true)

      const { data } = await supabase
        .from('user_translations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      setHistory(data || [])
      setLoading(false)
    },
    [user]
  )

  // ===== 保存翻译记录 =====
  const saveTranslation = useCallback(
    async (params: {
      source_text: string
      translated_text: string
      source_lang?: string
      target_lang?: string
      unfamiliar_words?: string[]
    }) => {
      if (!user) return { error: '未登录' }

      const { data, error: err } = await supabase
        .from('user_translations')
        .insert({
          user_id: user.id,
          source_text: params.source_text,
          translated_text: params.translated_text,
          source_lang: params.source_lang || 'en',
          target_lang: params.target_lang || 'zh',
          unfamiliar_words: params.unfamiliar_words || [],
        })
        .select()
        .single()

      if (err) return { error: err.message, data: null }

      // 更新本地列表（添加到头部）
      if (data) setHistory(prev => [data, ...prev])
      return { error: null, data: data || null }
    },
    [user]
  )

  // ===== 切换收藏 =====
  const toggleStar = useCallback(
    async (id: number) => {
      const item = history.find(h => h.id === id)
      if (!item) return

      const newStarred = !item.is_starred
      const { error: err } = await supabase
        .from('user_translations')
        .update({ is_starred: newStarred })
        .eq('id', id)

      if (!err) {
        setHistory(prev =>
          prev.map(h => (h.id === id ? { ...h, is_starred: newStarred } : h))
        )
      }
    },
    [history]
  )

  // ===== 删除翻译记录 =====
  const deleteTranslation = useCallback(async (id: number) => {
    const { error: err } = await supabase
      .from('user_translations')
      .delete()
      .eq('id', id)

    if (!err) {
      setHistory(prev => prev.filter(h => h.id !== id))
    }
  }, [])

  return {
    history,
    loading,
    fetchHistory,
    saveTranslation,
    toggleStar,
    deleteTranslation,
  }
}
