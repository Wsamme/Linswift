/**
 * useStudyRecords - 学习记录管理 hook（React Query 版）
 *
 * 功能：
 * 1. getHeatmapData(days) - 获取热度图数据
 * 2. todayRecord - 今日学习记录（自动加载 + 缓存）
 * 3. recordStudy(data) - 写入/更新今日学习记录
 * 4. getStreakDays() - 计算连续学习天数
 *
 * 缓存策略：
 *   - queryKey: ['studyRecords', 'today', userId]
 *   - staleTime: 1 分钟（学习记录变化较频繁）
 */

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type StudyRecord } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// 热度图格子的数据类型
export interface HeatmapCell {
  date: string     // YYYY-MM-DD
  level: number    // 0-4 强度级别
  duration: number // 学习分钟数
}

export function useStudyRecords() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // ===== 今日学习记录（自动缓存 1 分钟） =====
  const {
    data: todayRecord,
    isLoading: loading,
  } = useQuery<StudyRecord | null>({
    queryKey: ['studyRecords', 'today', user?.id],
    queryFn: async () => {
      if (!user) return null
      const today = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('study_records')
        .select('*')
        .eq('user_id', user.id)
        .eq('study_date', today)
        .single()
      return data ?? null
    },
    enabled: !!user,
    staleTime: 1 * 60 * 1000, // 1 分钟
  })

  // ===== 获取热度图数据 =====
  const getHeatmapData = useCallback(
    async (days: number = 84): Promise<HeatmapCell[]> => {
      if (!user) return []

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - days)

      const { data } = await supabase
        .from('study_records')
        .select('study_date, study_duration')
        .eq('user_id', user.id)
        .gte('study_date', startDate.toISOString().split('T')[0])
        .lte('study_date', endDate.toISOString().split('T')[0])
        .order('study_date', { ascending: true })

      const recordMap = new Map<string, number>()
      data?.forEach(r => recordMap.set(r.study_date, r.study_duration))

      const cells: HeatmapCell[] = []
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        const duration = recordMap.get(dateStr) || 0
        let level = 0
        if (duration > 0 && duration < 15) level = 1
        else if (duration >= 15 && duration < 30) level = 2
        else if (duration >= 30 && duration < 60) level = 3
        else if (duration >= 60) level = 4
        cells.push({ date: dateStr, level, duration })
      }

      return cells
    },
    [user]
  )

  // ===== 兼容旧代码的 fetchTodayRecord =====
  const fetchTodayRecord = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['studyRecords', 'today', user?.id] })
  }, [queryClient, user?.id])

  // ===== 写入/更新今日学习记录 =====
  const recordStudy = useCallback(
    async (updates: {
      study_duration?: number
      vocabulary_learned?: number
      listening_minutes?: number
      speaking_minutes?: number
      reading_pages?: number
    }) => {
      if (!user) return

      const today = new Date().toISOString().split('T')[0]
      await supabase
        .from('study_records')
        .upsert(
          {
            user_id: user.id,
            study_date: today,
            ...updates,
          },
          { onConflict: 'user_id,study_date' }
        )

      // 更新缓存
      queryClient.invalidateQueries({ queryKey: ['studyRecords', 'today', user.id] })
    },
    [user, queryClient]
  )

  // ===== 增量记录学习数据（在原有基础上 +N） =====
  const appendStudy = useCallback(
    async (increments: {
      study_duration?: number
      vocabulary_learned?: number
      listening_minutes?: number
      speaking_minutes?: number
      reading_pages?: number
    }) => {
      if (!user) return

      const base = todayRecord ?? {
        study_duration: 0,
        vocabulary_learned: 0,
        listening_minutes: 0,
        speaking_minutes: 0,
        reading_pages: 0,
      }

      await recordStudy({
        study_duration: (base.study_duration || 0) + (increments.study_duration || 0),
        vocabulary_learned: (base.vocabulary_learned || 0) + (increments.vocabulary_learned || 0),
        listening_minutes: (base.listening_minutes || 0) + (increments.listening_minutes || 0),
        speaking_minutes: (base.speaking_minutes || 0) + (increments.speaking_minutes || 0),
        reading_pages: (base.reading_pages || 0) + (increments.reading_pages || 0),
      })
    },
    [user, todayRecord, recordStudy]
  )

  // ===== 计算连续学习天数 =====
  const getStreakDays = useCallback(async (): Promise<number> => {
    if (!user) return 0

    const { data } = await supabase
      .from('study_records')
      .select('study_date')
      .eq('user_id', user.id)
      .gt('study_duration', 0)
      .order('study_date', { ascending: false })
      .limit(365)

    if (!data || data.length === 0) return 0

    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dates = new Set(data.map(r => r.study_date))

    for (let d = new Date(today); ; d.setDate(d.getDate() - 1)) {
      const dateStr = d.toISOString().split('T')[0]
      if (dates.has(dateStr)) {
        streak++
      } else {
        if (streak === 0 && d.getTime() === today.getTime()) continue
        break
      }
    }

    return streak
  }, [user])

  return {
    todayRecord: todayRecord ?? null,
    loading,
    getHeatmapData,
    fetchTodayRecord,
    recordStudy,
    appendStudy,
    getStreakDays,
  }
}
