import { describe, it, expect, beforeEach } from 'vitest'
import { clearLocalStorage } from '../test/setup'
import {
  GRAMMAR_STATE_VERSION,
  GRAMMAR_ERROR_LABELS,
  loadGrammarLearningState,
  saveGrammarLearningState,
  evaluateGrammarExercise,
  applyGrammarSubmission,
  getDueGrammarReviewItems,
  getNodeDueReviewCount,
  getTopGrammarWeaknesses,
  type GrammarChoiceExercise,
  type GrammarClozeExercise,
  type GrammarCorrectionExercise,
  type GrammarLearningState,
} from './grammar'

describe('grammar', () => {
  beforeEach(() => {
    clearLocalStorage()
  })

  describe('GRAMMAR_STATE_VERSION', () => {
    it('is 2', () => {
      expect(GRAMMAR_STATE_VERSION).toBe(2)
    })
  })

  describe('GRAMMAR_ERROR_LABELS', () => {
    it('has labels for common error tags', () => {
      expect(GRAMMAR_ERROR_LABELS.tense).toBe('时态')
      expect(GRAMMAR_ERROR_LABELS.article).toBe('冠词')
      expect(GRAMMAR_ERROR_LABELS.preposition).toBe('介词')
    })

    it('has at least 10 error tags', () => {
      expect(Object.keys(GRAMMAR_ERROR_LABELS).length).toBeGreaterThanOrEqual(10)
    })
  })

  describe('loadGrammarLearningState', () => {
    it('returns default state when nothing saved', () => {
      const state = loadGrammarLearningState('user-1')
      expect(state.version).toBe(GRAMMAR_STATE_VERSION)
      expect(state.attempts).toEqual([])
      expect(state.errorStats).toEqual({})
      expect(state.reviewQueue).toEqual([])
      expect(state.nodeSnapshots).toEqual({})
    })

    it('returns default state for corrupted JSON', () => {
      window.localStorage.setItem('linswift-grammar-learning-v2:user-1', '{bad json')
      const state = loadGrammarLearningState('user-1')
      expect(state.attempts).toEqual([])
    })

    it('loads saved state', () => {
      const saved = {
        version: 2,
        attempts: [{ exerciseId: 'e1', nodeId: 'n1', answer: 'a', correct: true, errorTag: 'tense', createdAt: '2026-01-01' }],
        errorStats: {},
        reviewQueue: [],
        nodeSnapshots: {},
      }
      window.localStorage.setItem('linswift-grammar-learning-v2:user-1', JSON.stringify(saved))
      const state = loadGrammarLearningState('user-1')
      expect(state.attempts).toHaveLength(1)
    })

    it('uses guest key when no userId', () => {
      const saved = { version: 2, attempts: [], errorStats: {}, reviewQueue: [], nodeSnapshots: {} }
      window.localStorage.setItem('linswift-grammar-learning-v2:guest', JSON.stringify(saved))
      const state = loadGrammarLearningState()
      expect(state.version).toBe(2)
    })
  })

  describe('saveGrammarLearningState', () => {
    it('persists state', () => {
      const state: GrammarLearningState = {
        version: 2,
        attempts: [],
        errorStats: {},
        reviewQueue: [],
        nodeSnapshots: {},
      }
      saveGrammarLearningState('user-1', state)
      const loaded = loadGrammarLearningState('user-1')
      expect(loaded.version).toBe(2)
    })
  })

  describe('evaluateGrammarExercise', () => {
    it('evaluates choice exercise correctly', () => {
      const exercise: GrammarChoiceExercise = {
        id: '1', type: 'choice', title: 'Test', prompt: 'Pick one',
        options: ['a', 'b', 'c'], answerIndex: 1, explanation: '', errorTag: 'tense',
      }
      expect(evaluateGrammarExercise(exercise, '1')).toBe(true)
      expect(evaluateGrammarExercise(exercise, '0')).toBe(false)
    })

    it('evaluates cloze exercise with normalization', () => {
      const exercise: GrammarClozeExercise = {
        id: '2', type: 'cloze', title: 'Test', prompt: 'Fill in',
        acceptedAnswers: ['has been'], explanation: '', errorTag: 'tense',
      }
      expect(evaluateGrammarExercise(exercise, 'has been')).toBe(true)
      expect(evaluateGrammarExercise(exercise, 'Has Been.')).toBe(true)
      expect(evaluateGrammarExercise(exercise, 'had been')).toBe(false)
    })

    it('evaluates correction exercise', () => {
      const exercise: GrammarCorrectionExercise = {
        id: '3', type: 'correction', title: 'Test', prompt: 'Fix it',
        sourceSentence: 'He go to school', acceptedAnswers: ['he goes to school'],
        explanation: '', errorTag: 'tense',
      }
      expect(evaluateGrammarExercise(exercise, 'He goes to school.')).toBe(true)
    })
  })

  describe('applyGrammarSubmission', () => {
    const baseState: GrammarLearningState = {
      version: 2, attempts: [], errorStats: {}, reviewQueue: [], nodeSnapshots: {},
    }

    it('adds attempts and updates snapshot', () => {
      const next = applyGrammarSubmission(baseState, {
        nodeId: 'n1',
        requiredResults: [{ exerciseId: 'e1', answer: 'a', correct: true, errorTag: 'tense' }],
        accuracy: 0.8,
      })
      expect(next.attempts).toHaveLength(1)
      expect(next.nodeSnapshots['n1']).toBeDefined()
      expect(next.nodeSnapshots['n1'].lastScore).toBe(0.8)
      expect(next.nodeSnapshots['n1'].completedExerciseIds).toContain('e1')
    })

    it('creates review queue item for wrong answers', () => {
      const next = applyGrammarSubmission(baseState, {
        nodeId: 'n1',
        requiredResults: [{ exerciseId: 'e1', answer: 'wrong', correct: false, errorTag: 'tense' }],
        accuracy: 0,
      })
      expect(next.reviewQueue.length).toBeGreaterThan(0)
      expect(next.reviewQueue[0].status).toBe('pending')
      expect(next.errorStats['tense'].wrongCount).toBe(1)
    })

    it('marks completion at accuracy >= 0.7', () => {
      const next = applyGrammarSubmission(baseState, {
        nodeId: 'n1',
        requiredResults: [{ exerciseId: 'e1', answer: 'a', correct: true, errorTag: 'tense' }],
        accuracy: 0.7,
      })
      expect(next.nodeSnapshots['n1'].completedAt).toBeTruthy()
    })

    it('does not mark completion at accuracy < 0.7', () => {
      const next = applyGrammarSubmission(baseState, {
        nodeId: 'n1',
        requiredResults: [{ exerciseId: 'e1', answer: 'a', correct: false, errorTag: 'tense' }],
        accuracy: 0.5,
      })
      expect(next.nodeSnapshots['n1'].completedAt).toBeNull()
    })
  })

  describe('getDueGrammarReviewItems', () => {
    it('returns items due before now', () => {
      const state: GrammarLearningState = {
        version: 2, attempts: [], errorStats: {},
        reviewQueue: [
          { id: '1', nodeId: 'n1', exerciseId: 'e1', errorTag: 'tense', dueAt: '2020-01-01T00:00:00Z', source: 'lesson', status: 'pending' },
          { id: '2', nodeId: 'n1', exerciseId: 'e2', errorTag: 'tense', dueAt: '2099-01-01T00:00:00Z', source: 'lesson', status: 'pending' },
          { id: '3', nodeId: 'n1', exerciseId: 'e3', errorTag: 'tense', dueAt: '2020-01-01T00:00:00Z', source: 'lesson', status: 'done' },
        ],
        nodeSnapshots: {},
      }
      const due = getDueGrammarReviewItems(state)
      expect(due).toHaveLength(1)
      expect(due[0].id).toBe('1')
    })
  })

  describe('getNodeDueReviewCount', () => {
    it('counts due items for specific node', () => {
      const state: GrammarLearningState = {
        version: 2, attempts: [], errorStats: {},
        reviewQueue: [
          { id: '1', nodeId: 'n1', exerciseId: 'e1', errorTag: 'tense', dueAt: '2020-01-01T00:00:00Z', source: 'lesson', status: 'pending' },
          { id: '2', nodeId: 'n2', exerciseId: 'e2', errorTag: 'tense', dueAt: '2020-01-01T00:00:00Z', source: 'lesson', status: 'pending' },
        ],
        nodeSnapshots: {},
      }
      expect(getNodeDueReviewCount(state, 'n1')).toBe(1)
    })
  })

  describe('getTopGrammarWeaknesses', () => {
    it('returns top N weaknesses sorted by wrongCount', () => {
      const state: GrammarLearningState = {
        version: 2, attempts: [], nodeSnapshots: {}, reviewQueue: [],
        errorStats: {
          tense: { errorTag: 'tense', wrongCount: 10, correctedCount: 2, lastSeenAt: '2026-01-01' },
          article: { errorTag: 'article', wrongCount: 5, correctedCount: 1, lastSeenAt: '2026-01-01' },
          preposition: { errorTag: 'preposition', wrongCount: 8, correctedCount: 0, lastSeenAt: '2026-01-01' },
        },
      }
      const top = getTopGrammarWeaknesses(state, 2)
      expect(top).toHaveLength(2)
      expect(top[0].errorTag).toBe('tense')
      expect(top[1].errorTag).toBe('preposition')
    })
  })
})
