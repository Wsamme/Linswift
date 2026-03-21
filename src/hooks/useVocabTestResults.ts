import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type VocabTestResult } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type TestType = 'reading_comprehension' | 'flashcard' | 'mixed'

export interface SaveVocabTestPayload {
  estimatedVocabulary: number
  testType: TestType
  score: Record<string, unknown>
}

export function useVocabTestResults() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: results = [], isLoading: loading } = useQuery<VocabTestResult[]>({
    queryKey: ['vocab-test-results', user?.id],
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('vocab_test_results')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw new Error(error.message)
      return data || []
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  })

  const saveResult = useCallback(
    async ({ estimatedVocabulary, testType, score }: SaveVocabTestPayload): Promise<boolean> => {
      if (!user) return false

      const { error } = await supabase.from('vocab_test_results').insert({
        user_id: user.id,
        estimated_vocabulary: estimatedVocabulary,
        test_type: testType,
        score,
      })

      if (error) {
        console.error('[vocab_test_results] insert failed:', error.message)
        return false
      }

      queryClient.invalidateQueries({ queryKey: ['vocab-test-results', user.id] })
      return true
    },
    [user, queryClient]
  )

  return {
    results,
    latestResult: results[0] || null,
    loading,
    saveResult,
  }
}
