import { supabase } from './supabase'

export type GrammarExerciseType = 'choice' | 'cloze' | 'correction' | 'rewrite'

export interface GrammarChoiceExercise {
  id: string
  type: 'choice'
  title: string
  prompt: string
  options: string[]
  answerIndex: number
  explanation: string
  errorTag: string
  required?: boolean
}

export interface GrammarClozeExercise {
  id: string
  type: 'cloze'
  title: string
  prompt: string
  placeholder?: string
  acceptedAnswers: string[]
  explanation: string
  errorTag: string
  required?: boolean
}

export interface GrammarCorrectionExercise {
  id: string
  type: 'correction'
  title: string
  prompt: string
  sourceSentence: string
  acceptedAnswers: string[]
  explanation: string
  errorTag: string
  required?: boolean
}

export interface GrammarRewriteExercise {
  id: string
  type: 'rewrite'
  title: string
  prompt: string
  hint?: string
  checklist: string[]
  sampleAnswer: string
  errorTag: string
  required?: boolean
}

export type GrammarExercise =
  | GrammarChoiceExercise
  | GrammarClozeExercise
  | GrammarCorrectionExercise
  | GrammarRewriteExercise

export interface GrammarExample {
  id: string
  sentence: string
  translation: string
  note: string
  sourceType?: 'core' | 'reader'
  linkedReadingId?: string
}

export interface GrammarWorkshop {
  id: string
  title: string
  prompt: string
  checklist: string[]
}

export interface GrammarUnit {
  id: string
  title: string
  objective: string
  formula: string[]
  scenarios: string[]
  contrast: string[]
  commonMistakes: string[]
  errorTags: string[]
}

export interface GrammarNodeBlueprint {
  nodeId: string
  level: string
  cluster: string
  summary: string
  prerequisiteNodeIds: string[]
  units: GrammarUnit[]
  examples: GrammarExample[]
  exercises: GrammarExercise[]
  workshops: GrammarWorkshop[]
  longSentenceReadingIds: string[]
}

export interface GrammarExerciseAttempt {
  exerciseId: string
  nodeId: string
  answer: string
  correct: boolean
  errorTag: string
  createdAt: string
}

export interface GrammarErrorStat {
  errorTag: string
  wrongCount: number
  correctedCount: number
  lastSeenAt: string
}

export interface GrammarReviewQueueItem {
  id: string
  nodeId: string
  exerciseId: string
  errorTag: string
  dueAt: string
  source: 'lesson' | 'long_sentence'
  status: 'pending' | 'done'
}

export interface GrammarNodeSnapshot {
  nodeId: string
  lastPracticedAt: string | null
  lastScore: number | null
  mastery: number
  completedExerciseIds: string[]
  completedAt: string | null
}

export interface GrammarLearningState {
  version: number
  attempts: GrammarExerciseAttempt[]
  errorStats: Record<string, GrammarErrorStat>
  reviewQueue: GrammarReviewQueueItem[]
  nodeSnapshots: Record<string, GrammarNodeSnapshot>
}

export interface GrammarSubmissionPayload {
  userId?: string
  nodeId: string
  requiredResults: Array<{
    exerciseId: string
    answer: string
    correct: boolean
    errorTag: string
  }>
  accuracy: number
}

export const GRAMMAR_STATE_VERSION = 2
export const GRAMMAR_ERROR_LABELS: Record<string, string> = {
  sentence_form: '句型结构',
  be_verb: 'be 动词',
  there_be: 'there be',
  pronoun_case: '代词形式',
  article: '冠词',
  noun_number: '名词单复数',
  quantifier: '数量表达',
  preposition: '介词',
  tense: '时态',
  aspect: '时体选择',
  word_order: '语序',
  comparative: '比较结构',
  modal: '情态动词',
  verb_pattern: '动词搭配',
  passive: '被动语态',
  conjunction: '连接逻辑',
  question_tag: '反义疑问',
  relative_clause: '定语从句',
  conditional: '条件句',
  reported_speech: '间接引语',
  noun_clause: '名词性从句',
  inversion: '倒装强调',
  discourse: '语篇衔接',
}

const STORAGE_PREFIX = 'linswift-grammar-learning-v2'

function buildStorageKey(userId?: string) {
  return `${STORAGE_PREFIX}:${userId || 'guest'}`
}

function defaultState(): GrammarLearningState {
  return {
    version: GRAMMAR_STATE_VERSION,
    attempts: [],
    errorStats: {},
    reviewQueue: [],
    nodeSnapshots: {},
  }
}

export function loadGrammarLearningState(userId?: string): GrammarLearningState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(buildStorageKey(userId))
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<GrammarLearningState>
    return {
      version: parsed.version ?? GRAMMAR_STATE_VERSION,
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      errorStats: parsed.errorStats ?? {},
      reviewQueue: Array.isArray(parsed.reviewQueue) ? parsed.reviewQueue : [],
      nodeSnapshots: parsed.nodeSnapshots ?? {},
    }
  } catch {
    return defaultState()
  }
}

export function saveGrammarLearningState(userId: string | undefined, state: GrammarLearningState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(buildStorageKey(userId), JSON.stringify(state))
}

function normalizeFreeText(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/g, '').toLowerCase()
}

export function evaluateGrammarExercise(exercise: GrammarExercise, answer: string) {
  const trimmed = answer.trim()
  if (exercise.type === 'choice') {
    const chosenIndex = Number(trimmed)
    return chosenIndex === exercise.answerIndex
  }

  if (exercise.type === 'cloze' || exercise.type === 'correction') {
    const normalized = normalizeFreeText(trimmed)
    return exercise.acceptedAnswers.some((item) => normalizeFreeText(item) === normalized)
  }

  const normalized = normalizeFreeText(trimmed)
  const sample = normalizeFreeText(exercise.sampleAnswer)
  const checklistPassed = exercise.checklist.every((item) => {
    const keyword = item.split(/[：:]/).pop()?.trim() || item.trim()
    if (!keyword) return true
    return normalized.includes(normalizeFreeText(keyword))
  })

  return normalized.length >= Math.min(sample.length * 0.45, 24) && checklistPassed
}

function ensureSnapshot(state: GrammarLearningState, nodeId: string): GrammarNodeSnapshot {
  if (!state.nodeSnapshots[nodeId]) {
    state.nodeSnapshots[nodeId] = {
      nodeId,
      lastPracticedAt: null,
      lastScore: null,
      mastery: 0,
      completedExerciseIds: [],
      completedAt: null,
    }
  }
  return state.nodeSnapshots[nodeId]
}

function nextDueDate(currentWrongCount: number) {
  const hours = currentWrongCount >= 5 ? 72 : currentWrongCount >= 3 ? 24 : 4
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function reviewKey(nodeId: string, exerciseId: string, errorTag: string) {
  return `${nodeId}:${exerciseId}:${errorTag}`
}

export function applyGrammarSubmission(
  prevState: GrammarLearningState,
  payload: GrammarSubmissionPayload
) {
  const nextState: GrammarLearningState = {
    version: prevState.version,
    attempts: [...prevState.attempts],
    errorStats: { ...prevState.errorStats },
    reviewQueue: prevState.reviewQueue.map((item) => ({ ...item })),
    nodeSnapshots: Object.fromEntries(
      Object.entries(prevState.nodeSnapshots).map(([key, value]) => [key, { ...value, completedExerciseIds: [...value.completedExerciseIds] }])
    ),
  }

  const snapshot = ensureSnapshot(nextState, payload.nodeId)
  const now = new Date().toISOString()

  payload.requiredResults.forEach((result) => {
    nextState.attempts.push({
      exerciseId: result.exerciseId,
      nodeId: payload.nodeId,
      answer: result.answer,
      correct: result.correct,
      errorTag: result.errorTag,
      createdAt: now,
    })

    if (result.correct) {
      if (!snapshot.completedExerciseIds.includes(result.exerciseId)) {
        snapshot.completedExerciseIds.push(result.exerciseId)
      }
    }

    const existingStat = nextState.errorStats[result.errorTag] ?? {
      errorTag: result.errorTag,
      wrongCount: 0,
      correctedCount: 0,
      lastSeenAt: now,
    }

    if (result.correct) {
      existingStat.correctedCount += 1
    } else {
      existingStat.wrongCount += 1
      const key = reviewKey(payload.nodeId, result.exerciseId, result.errorTag)
      const existingQueueIndex = nextState.reviewQueue.findIndex((item) => item.id === key && item.status === 'pending')
      const queueItem: GrammarReviewQueueItem = {
        id: key,
        nodeId: payload.nodeId,
        exerciseId: result.exerciseId,
        errorTag: result.errorTag,
        dueAt: nextDueDate(existingStat.wrongCount),
        source: 'lesson',
        status: 'pending',
      }
      if (existingQueueIndex >= 0) {
        nextState.reviewQueue[existingQueueIndex] = queueItem
      } else {
        nextState.reviewQueue.push(queueItem)
      }
    }

    existingStat.lastSeenAt = now
    nextState.errorStats[result.errorTag] = existingStat
  })

  snapshot.lastPracticedAt = now
  snapshot.lastScore = payload.accuracy
  snapshot.mastery = Math.max(snapshot.mastery, Math.round(payload.accuracy * 100))
  if (payload.accuracy >= 0.7) {
    snapshot.completedAt = snapshot.completedAt ?? now
  }

  nextState.reviewQueue = nextState.reviewQueue.map((item) => {
    if (item.nodeId !== payload.nodeId) return item
    const matched = payload.requiredResults.find((result) => reviewKey(payload.nodeId, result.exerciseId, result.errorTag) === item.id)
    if (matched?.correct) {
      return { ...item, status: 'done' }
    }
    return item
  })

  return nextState
}

export function getDueGrammarReviewItems(state: GrammarLearningState, now = new Date()) {
  return state.reviewQueue.filter((item) => item.status === 'pending' && new Date(item.dueAt) <= now)
}

export function getNodeDueReviewCount(state: GrammarLearningState, nodeId: string) {
  return getDueGrammarReviewItems(state).filter((item) => item.nodeId === nodeId).length
}

export function getTopGrammarWeaknesses(state: GrammarLearningState, limit = 3) {
  return Object.values(state.errorStats)
    .sort((a, b) => b.wrongCount - a.wrongCount || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit)
}

export async function syncGrammarSubmissionToSupabase(payload: GrammarSubmissionPayload) {
  if (!payload.userId) return

  const now = new Date().toISOString()
  const attempts = payload.requiredResults.map((result) => ({
    user_id: payload.userId,
    node_id: payload.nodeId,
    exercise_id: result.exerciseId,
    answer_payload: { answer: result.answer },
    is_correct: result.correct,
    error_tag: result.errorTag,
    review_source: 'lesson',
    created_at: now,
  }))

  const attemptRes = await supabase.from('grammar_attempts').insert(attempts)
  if (attemptRes.error) return

  const wrongGroups = payload.requiredResults.filter((item) => !item.correct)
  const correctedGroups = payload.requiredResults.filter((item) => item.correct)

  for (const item of wrongGroups) {
    const rpcRes = await supabase.rpc('increment_grammar_error_stat', {
      p_user_id: payload.userId,
      p_error_tag: item.errorTag,
      p_wrong_delta: 1,
      p_corrected_delta: 0,
    })
    if (rpcRes.error) {
      break
    }
  }

  for (const item of correctedGroups) {
    const rpcRes = await supabase.rpc('increment_grammar_error_stat', {
      p_user_id: payload.userId,
      p_error_tag: item.errorTag,
      p_wrong_delta: 0,
      p_corrected_delta: 1,
    })
    if (rpcRes.error) {
      break
    }
  }
}
