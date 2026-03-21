import { useCallback, useEffect, useState } from 'react'
import {
  applyGrammarSubmission,
  loadGrammarLearningState,
  saveGrammarLearningState,
  syncGrammarSubmissionToSupabase,
  type GrammarLearningState,
  type GrammarSubmissionPayload,
} from '../lib/grammar'

export function useGrammarLearning(userId?: string) {
  const [state, setState] = useState<GrammarLearningState>(() => loadGrammarLearningState(userId))

  useEffect(() => {
    setState(loadGrammarLearningState(userId))
  }, [userId])

  const submit = useCallback(async (payload: Omit<GrammarSubmissionPayload, 'userId'>) => {
    const completePayload: GrammarSubmissionPayload = {
      ...payload,
      userId,
    }
    setState((prev) => {
      const next = applyGrammarSubmission(prev, completePayload)
      saveGrammarLearningState(userId, next)
      return next
    })
    await syncGrammarSubmissionToSupabase(completePayload)
  }, [userId])

  return { state, submit, reload: () => setState(loadGrammarLearningState(userId)) }
}
