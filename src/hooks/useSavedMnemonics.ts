import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type SavedMnemonic } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function useSavedMnemonics() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: mnemonics = [], isLoading: loading } = useQuery<SavedMnemonic[]>({
    queryKey: ['saved-mnemonics', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('saved_mnemonics')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw new Error(error.message)
      return data || []
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  })

  const saveMnemonic = useCallback(
    async (targetWords: string[], story: string) => {
      if (!user) return { error: '未登录' as const }
      const { error } = await supabase.from('saved_mnemonics').insert({
        user_id: user.id,
        target_words: targetWords,
        story,
      })
      if (error) return { error: error.message }
      queryClient.invalidateQueries({ queryKey: ['saved-mnemonics', user.id] })
      return { error: null }
    },
    [user, queryClient]
  )

  return {
    mnemonics,
    loading,
    saveMnemonic,
  }
}

