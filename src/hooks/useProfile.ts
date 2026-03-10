/**
 * useProfile - 用户资料管理 hook（React Query 版）
 *
 * 功能：
 * 1. 自动从 profiles 表读取当前用户资料（带缓存）
 * 2. updateProfile() - 更新昵称、头像等（乐观更新）
 *
 * 缓存策略：
 *   - queryKey: ['profile', userId]
 *   - staleTime: 10 分钟
 *   - 更新后自动使缓存失效并重新拉取
 *
 * 依赖：
 * - 必须在 <AuthProvider> + <QueryClientProvider> 内部使用
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Profile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useProfile() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // ===== 读取资料（自动缓存 10 分钟） =====
  const {
    data: profile,
    isLoading: loading,
    error: queryError,
    refetch: fetchProfile,
  } = useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.warn('读取 profile 失败:', error.message)
        // 降级：返回 mock profile
        return {
          id: user.id,
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'User',
          avatar_url: null,
          level: 1,
          total_study_days: 0,
          total_study_hours: 0,
          vocabulary_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Profile
      }

      return data
    },
    enabled: !!user, // 只有登录后才查询
    staleTime: 10 * 60 * 1000, // 10 分钟内不重新请求
  })

  // ===== 更新资料（Mutation + 乐观更新） =====
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Pick<Profile, 'username' | 'avatar_url'>>) => {
      if (!user) throw new Error('未登录')

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)

      if (error) throw new Error(error.message)
      return updates
    },
    // 乐观更新：先更新本地缓存，再等服务器确认
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['profile', user?.id] })
      const previous = queryClient.getQueryData(['profile', user?.id])
      queryClient.setQueryData(['profile', user?.id], (old: Profile | null) =>
        old ? { ...old, ...updates } : null
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      // 回滚
      if (context?.previous) {
        queryClient.setQueryData(['profile', user?.id], context.previous)
      }
    },
    onSettled: () => {
      // 无论成功失败，都重新拉取最新数据
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    },
  })

  const updateProfile = useCallback(
    async (updates: Partial<Pick<Profile, 'username' | 'avatar_url'>>) => {
      try {
        await updateMutation.mutateAsync(updates)
        return { error: null }
      } catch (err: any) {
        return { error: err.message }
      }
    },
    [updateMutation]
  )

  return {
    profile: profile ?? null,
    loading,
    error: queryError ? (queryError as Error).message : null,
    fetchProfile,
    updateProfile,
  }
}
