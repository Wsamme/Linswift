import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Check, X, Volume2, Loader2, VolumeX, ArrowRight, Plus } from 'lucide-react'
import { speakEnglish } from '../lib/tts'
import { useVocabTestResults } from '../hooks/useVocabTestResults'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getWordDetail } from '../services/gemini'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'
import {
  estimateVocabularyByAnswerStats,
  getLevelWordRange,
  PUBLIC_VOCAB_CANDIDATE_COUNT,
  PUBLIC_VOCAB_TOTAL_WORDS,
  VOCAB_LEVELS,
  VOCAB_LEVEL_COUNT,
  VOCAB_LEVEL_PASS_SCORE,
  VOCAB_LEVEL_TARGETS,
  VOCAB_WORDS_PER_LEVEL_TEST,
  randomSampleWords,
} from '../data/vocab-test/openSourceVocab'

const VOCAB_TEST_AUTO_AUDIO_KEY = 'linswift_vocab_test_auto_audio'
const VOCAB_TEST_LATEST_KEY = 'linswift_vocab_test_latest_result'

interface AnswerEvent {
  level: number
  known: boolean
}

type Stage = 'testing' | 'level_result' | 'completed'

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

interface EnrichedWord {
  word: string
  phonetic: string | null
  meaning: string | null
}

interface LocalVocabTestResult {
  userId: string
  estimatedVocabulary: number
  levelReached: number
  savedAt: string
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getLevelReachedFromScore(score: Record<string, unknown> | null | undefined) {
  const publicProfile = toRecord(score?.public_vocab_profile)
  const rawLevelReached = Number(publicProfile?.level_reached ?? score?.level_reached ?? 0)
  return Number.isFinite(rawLevelReached) ? Math.max(0, Math.floor(rawLevelReached)) : 0
}

export default function VocabTestPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/vocab')
  const { user } = useAuth()
  const { saveResult, latestResult } = useVocabTestResults()

  const [autoPlayAudio, setAutoPlayAudio] = useState<boolean>(() => {
    const raw = localStorage.getItem(VOCAB_TEST_AUTO_AUDIO_KEY)
    return raw === null ? true : raw === '1'
  })

  const [stage, setStage] = useState<Stage>('testing')
  const [levelIndex, setLevelIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [levelWords, setLevelWords] = useState<string[]>(() => randomSampleWords(VOCAB_LEVELS[0], VOCAB_WORDS_PER_LEVEL_TEST))
  const [knownInLevel, setKnownInLevel] = useState(0)
  const [unknownInLevel, setUnknownInLevel] = useState<string[]>([])
  const [initialPassedLevels, setInitialPassedLevels] = useState(0)
  const [answerEvents, setAnswerEvents] = useState<AnswerEvent[]>([])
  const [importingUnknown, setImportingUnknown] = useState(false)

  const spokenRef = useRef('')
  const savedRef = useRef(false)
  const restoredRef = useRef(false)

  const currentWord = levelWords[questionIndex]
  const isLevelFinished = questionIndex >= levelWords.length
  const levelPassed = isLevelFinished && knownInLevel >= VOCAB_LEVEL_PASS_SCORE
  const levelReached = levelIndex + (levelPassed ? 1 : 0)
  const currentLevelRange = getLevelWordRange(levelIndex)

  const answerStatsByLevel = useMemo(() => {
    const stats = Array.from({ length: VOCAB_LEVEL_COUNT }, () => ({ known: 0, unknown: 0, total: 0 }))
    for (const ev of answerEvents) {
      if (ev.level < 0 || ev.level >= VOCAB_LEVEL_COUNT) continue
      stats[ev.level].total += 1
      if (ev.known) stats[ev.level].known += 1
      else stats[ev.level].unknown += 1
    }
    return stats
  }, [answerEvents])

  const knownSampleCount = useMemo(
    () => answerEvents.reduce((count, event) => count + (event.known ? 1 : 0), 0),
    [answerEvents]
  )

  const restoredEstimatedVocab = useMemo(() => {
    if (latestResult && Number.isFinite(latestResult.estimated_vocabulary)) {
      return latestResult.estimated_vocabulary
    }

    if (!user) return null

    try {
      const raw = localStorage.getItem(VOCAB_TEST_LATEST_KEY)
      if (!raw) return null
      const cached = JSON.parse(raw) as LocalVocabTestResult
      if (cached.userId !== user.id) return null
      return Number.isFinite(cached.estimatedVocabulary) ? cached.estimatedVocabulary : null
    } catch {
      return null
    }
  }, [latestResult, user])

  useEffect(() => {
    if (restoredRef.current) return

    let passedLevels = 0
    let startLevel = 0
    let cancelled = false

    if (latestResult) {
      const score = latestResult.score as Record<string, unknown> | null
      passedLevels = getLevelReachedFromScore(score)
    } else if (user) {
      try {
        const raw = localStorage.getItem(VOCAB_TEST_LATEST_KEY)
        if (raw) {
          const cached = JSON.parse(raw) as LocalVocabTestResult
          if (cached.userId === user.id) {
            passedLevels = Math.max(0, Math.floor(Number(cached.levelReached || 0)))
          }
        }
      } catch {
        // Ignore invalid local cache.
      }
    }

    startLevel = Math.min(passedLevels, VOCAB_LEVEL_COUNT - 1)

    restoredRef.current = true
    queueMicrotask(() => {
      if (cancelled) return
      setInitialPassedLevels(Math.min(passedLevels, VOCAB_LEVEL_COUNT))
      setLevelIndex(startLevel)
      setLevelWords(randomSampleWords(VOCAB_LEVELS[startLevel], VOCAB_WORDS_PER_LEVEL_TEST))
      setQuestionIndex(0)
      setKnownInLevel(0)
      setUnknownInLevel([])
      setAnswerEvents([])
      setStage('testing')
      spokenRef.current = ''
      savedRef.current = false
    })

    return () => {
      cancelled = true
    }
  }, [latestResult, user])

  const estimatedVocab = useMemo(() => {
    if (answerEvents.length === 0) {
      return restoredEstimatedVocab || 0
    }

    return estimateVocabularyByAnswerStats(answerStatsByLevel)
  }, [answerEvents.length, answerStatsByLevel, restoredEstimatedVocab])

  useEffect(() => {
    localStorage.setItem(VOCAB_TEST_AUTO_AUDIO_KEY, autoPlayAudio ? '1' : '0')
  }, [autoPlayAudio])

  useEffect(() => {
    if (!autoPlayAudio || stage !== 'testing' || !currentWord) return
    const key = `${levelIndex}:${questionIndex}:${currentWord}`
    if (spokenRef.current === key) return
    spokenRef.current = key
    speakEnglish(currentWord)
  }, [autoPlayAudio, stage, levelIndex, questionIndex, currentWord])

  const handleAnswer = (known: boolean) => {
    if (stage !== 'testing' || !currentWord) return

    if (known) {
      setKnownInLevel((prev) => prev + 1)
    }
    else setUnknownInLevel((prev) => [...prev, currentWord])
    setAnswerEvents((prev) => [...prev, { level: levelIndex, known }])

    const nextIndex = questionIndex + 1
    if (nextIndex >= levelWords.length) {
      setQuestionIndex(nextIndex)
      setStage('level_result')
      return
    }

    setQuestionIndex(nextIndex)
  }

  const goNextLevel = () => {
    if (levelIndex >= VOCAB_LEVEL_COUNT - 1) {
      setStage('completed')
      return
    }

    const nextLevel = levelIndex + 1
    setLevelIndex(nextLevel)
    setLevelWords(randomSampleWords(VOCAB_LEVELS[nextLevel], VOCAB_WORDS_PER_LEVEL_TEST))
    setQuestionIndex(0)
    setKnownInLevel(0)
    setUnknownInLevel([])
    setStage('testing')
    spokenRef.current = ''
  }

  const retryLevel = () => {
    setAnswerEvents((prev) => prev.filter((ev) => ev.level !== levelIndex))
    setLevelWords(randomSampleWords(VOCAB_LEVELS[levelIndex], VOCAB_WORDS_PER_LEVEL_TEST))
    setQuestionIndex(0)
    setKnownInLevel(0)
    setUnknownInLevel([])
    setStage('testing')
    spokenRef.current = ''
  }

  const enrichVocabularyRows = async (words: string[]) => {
    if (!user || words.length === 0) return

    const targetWords = Array.from(new Set(words.map((word) => word.toLowerCase().trim()))).filter(Boolean)
    const allEnriched: EnrichedWord[] = []

    for (const batch of chunk(targetWords, 4)) {
      const batchResults = await Promise.all(
        batch.map(async (word) => {
          try {
            const detail = await getWordDetail(word)
            const meaning = detail.meaning?.trim()
            const phonetic = detail.phonetic?.trim()
            const isFallbackMeaning = meaning?.includes('AI 暂时不可用') || meaning?.includes('[AI offline]')
            return {
              word,
              meaning: meaning && !isFallbackMeaning ? meaning : null,
              phonetic: phonetic && phonetic !== '/---/' ? phonetic : null,
            } as EnrichedWord
          } catch {
            return { word, meaning: null, phonetic: null } as EnrichedWord
          }
        })
      )
      allEnriched.push(...batchResults)
    }

    const updateRows = allEnriched.filter((row) => row.meaning || row.phonetic)
    if (updateRows.length === 0) return

    for (const row of updateRows) {
      await supabase
        .from('user_vocabulary')
        .update({
          meaning: row.meaning,
          phonetic: row.phonetic,
        })
        .eq('user_id', user.id)
        .eq('word', row.word)
    }
  }

  const importUnknownWords = async () => {
    if (!user || unknownInLevel.length === 0 || importingUnknown) return

    setImportingUnknown(true)
    const rows = Array.from(new Set(unknownInLevel.map((word) => word.toLowerCase().trim())))
      .filter(Boolean)
      .map((word) => ({
        user_id: user.id,
        word,
        language_code: 'en',
        language_label: 'English',
        phonetic: null,
        meaning: null,
        example_sentence: null,
        source: 'test' as const,
        mastery_level: 0,
      }))

    let { error } = await supabase.from('user_vocabulary').upsert(rows, {
      onConflict: 'user_id,word,language_code',
      ignoreDuplicates: true,
    })

    if (error && error.message.toLowerCase().includes('language_')) {
      const legacyRows = rows.map(({ language_code: _languageCode, language_label: _languageLabel, ...rest }) => rest)
      const legacyResult = await supabase.from('user_vocabulary').upsert(legacyRows, {
        onConflict: 'user_id,word',
        ignoreDuplicates: true,
      })
      error = legacyResult.error
    }

    if (error) {
      console.error('导入测试生词失败:', error.message)
    }

    await enrichVocabularyRows(rows.map((row) => row.word))

    setImportingUnknown(false)
    setStage('completed')
  }

  useEffect(() => {
    async function persistResult() {
      if (stage !== 'completed' || savedRef.current) return
      savedRef.current = true

      const payload = {
        mode: 'open_source_level_challenge',
        level_reached: levelReached,
        public_vocab_profile: {
          level_reached: levelReached,
          mastered_public_words: estimatedVocab,
          total_words: PUBLIC_VOCAB_TOTAL_WORDS,
          level_targets: VOCAB_LEVEL_TARGETS,
          filtered_candidate_count: PUBLIC_VOCAB_CANDIDATE_COUNT,
        },
        pass_score: VOCAB_LEVEL_PASS_SCORE,
        words_per_level: VOCAB_WORDS_PER_LEVEL_TEST,
        known_sample_count: knownSampleCount,
        failed_level_unknown_words: levelPassed ? [] : unknownInLevel,
        scoring_model: {
          type: 'public_vocab_targets',
          answer_stats: answerStatsByLevel,
          note: 'Known words from the public core list are counted in progress only and are not inserted into user_vocabulary.',
        },
      }

      const saved = await saveResult({
        estimatedVocabulary: estimatedVocab,
        testType: 'mixed',
        score: payload,
      })

      if (!saved && user) {
        const cache: LocalVocabTestResult = {
          userId: user.id,
          estimatedVocabulary: estimatedVocab,
          levelReached,
          savedAt: new Date().toISOString(),
        }
        localStorage.setItem(VOCAB_TEST_LATEST_KEY, JSON.stringify(cache))
      }
    }

    persistResult()
  }, [
    stage,
    saveResult,
    user,
    estimatedVocab,
    levelReached,
    levelPassed,
    knownSampleCount,
    unknownInLevel,
    answerStatsByLevel,
  ])

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center px-8 text-center">
        <div>
          <p className="text-[15px] text-[var(--color-foreground)] mb-2">请先登录后进行词汇量测试</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold"
          >
            去登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">词汇量测试</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoPlayAudio((v) => !v)}
            className={`p-1.5 rounded-full ${autoPlayAudio ? 'bg-[var(--color-primary-light)]' : 'bg-[var(--color-background-secondary)]'}`}
            title={autoPlayAudio ? '自动发音已开启' : '自动发音已关闭'}
          >
            {autoPlayAudio
              ? <Volume2 size={16} className="text-[var(--color-primary)]" />
              : <VolumeX size={16} className="text-[var(--color-muted)]" />}
          </button>
          <span className="text-[12px] text-[var(--color-muted)]">L{levelIndex + 1}/{VOCAB_LEVEL_COUNT}</span>
        </div>
      </div>
      {initialPassedLevels > 0 && (
        <div className="mx-5 mb-3 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] text-[12px] text-[var(--color-muted)] text-center">
          已按上次结果继续测试：已通过 {initialPassedLevels} 个等级
        </div>
      )}

      <div className="flex flex-col items-center mb-4">
        <p className="text-[12px] text-[var(--color-muted)] mb-1">预估词汇量</p>
        <p className="text-[42px] font-bold text-[var(--color-primary)] leading-none">{estimatedVocab.toLocaleString()}</p>
        <p className="text-[11px] text-[var(--color-muted)] mt-1">基于公共核心词库实时估算，L10 对应 20,000 熟词</p>
      </div>

      {stage === 'testing' && (
        <>
          <div className="mx-5 mb-3">
            <div className="flex items-center justify-between text-[12px] text-[var(--color-muted)] mb-1">
              <span>第 {levelIndex + 1} 级</span>
              <span>{Math.min(questionIndex + 1, levelWords.length)}/{levelWords.length}</span>
            </div>
            <div className="h-1.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--color-primary)] rounded-full transition-all" style={{ width: `${(questionIndex / levelWords.length) * 100}%` }} />
            </div>
          </div>

          <div className="mx-5 mb-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-background-secondary)] text-[12px] text-[var(--color-muted)] text-center">
            每级随机 10 词，答对至少 {VOCAB_LEVEL_PASS_SCORE} 词可进入下一级；人名、地名、品牌名已从公共词库中剔除
          </div>

          <div className="flex-1 flex items-center justify-center px-8">
            <div className="w-full max-w-[320px] bg-[var(--color-card)] rounded-[var(--radius-lg)] p-8 text-center border border-[var(--color-border)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)] mb-3">
                L{levelIndex + 1} · {currentLevelRange.start.toLocaleString()}-{currentLevelRange.end.toLocaleString()} core words
              </p>
              <h2 className="text-[34px] font-bold text-[var(--color-foreground)] mb-4 break-words">{currentWord}</h2>
              <button
                className="p-2.5 rounded-full bg-[var(--color-primary-light)] mb-3 active:scale-90 transition-transform"
                onClick={() => currentWord && speakEnglish(currentWord)}
              >
                <Volume2 size={20} className="text-[var(--color-primary)]" />
              </button>
              <p className="text-[12px] text-[var(--color-muted)]">你认识这个单词吗？</p>
            </div>
          </div>

          <div className="px-8 py-6 flex gap-6 justify-center">
            <button onClick={() => handleAnswer(false)} className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-full bg-[var(--color-error)]/10 flex items-center justify-center active:scale-90 transition-transform border-2 border-[var(--color-error)]/20">
                <X size={28} className="text-[var(--color-error)]" />
              </div>
              <span className="text-[12px] text-[var(--color-muted)]">不认识</span>
            </button>
            <button onClick={() => handleAnswer(true)} className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center active:scale-90 transition-transform border-2 border-[var(--color-success)]/20">
                <Check size={28} className="text-[var(--color-success)]" />
              </div>
              <span className="text-[12px] text-[var(--color-muted)]">认识</span>
            </button>
          </div>
        </>
      )}

      {stage === 'level_result' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <h2 className="text-[24px] font-bold text-[var(--color-foreground)] mb-2">第 {levelIndex + 1} 级{levelPassed ? '通过' : '未通过'}</h2>
          <p className="text-[14px] text-[var(--color-muted)] mb-1">本级认识 {knownInLevel}/{levelWords.length} 个词</p>
          <p className="text-[13px] text-[var(--color-muted)] mb-6">通过线：{VOCAB_LEVEL_PASS_SCORE}/{VOCAB_WORDS_PER_LEVEL_TEST}</p>
          <p className="text-[12px] text-[var(--color-muted)] mb-6">通过等级只更新公共词汇掌握进度，不会把基础词批量写入个人词库。</p>

          {levelPassed ? (
            <button
              onClick={goNextLevel}
              className="w-full max-w-[280px] py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold flex items-center justify-center gap-2"
            >
              {levelIndex >= VOCAB_LEVEL_COUNT - 1 ? '完成测试' : '进入下一等级'} <ArrowRight size={16} />
            </button>
          ) : (
            <div className="w-full max-w-[280px] space-y-3">
              <button
                onClick={importUnknownWords}
                disabled={importingUnknown || unknownInLevel.length === 0}
                className="w-full py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {importingUnknown ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 一键加入陌生词汇库 ({unknownInLevel.length})
              </button>
              <button
                onClick={() => setStage('completed')}
                className="w-full py-3 bg-[var(--color-background-secondary)] text-[var(--color-foreground)] rounded-[var(--radius-sm)] text-[14px] font-semibold"
              >
                先不加入，结束测试
              </button>
              <button
                onClick={retryLevel}
                className="w-full py-3 bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-foreground)] rounded-[var(--radius-sm)] text-[14px] font-semibold"
              >
                重测本等级
              </button>
            </div>
          )}
        </div>
      )}

      {stage === 'completed' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <span className="text-[48px] mb-4">🎯</span>
          <h2 className="text-[22px] font-bold text-[var(--color-foreground)] mb-2">测试完成</h2>
          <p className="text-[14px] text-[var(--color-muted)] mb-1">
            已通关等级：{Math.min(VOCAB_LEVEL_COUNT, levelReached)} / {VOCAB_LEVEL_COUNT}
          </p>
          <p className="text-[14px] text-[var(--color-muted)] mb-2">本次判断认识样本词：{knownSampleCount}</p>
          <p className="text-[16px] text-[var(--color-foreground)] mb-1">预估词汇量</p>
          <p className="text-[56px] font-bold text-[var(--color-primary)] leading-none mb-6">{estimatedVocab.toLocaleString()}</p>
          <p className="text-[12px] text-[var(--color-muted)] mb-6">公共核心词库总量 {PUBLIC_VOCAB_TOTAL_WORDS.toLocaleString()} 词，可继续把本次陌生词加入个人词库做精学。</p>
          <button
            onClick={() => navigateSafely(navigate, '/app/vocab')}
            className="px-8 py-3 bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] text-[14px] font-semibold active:scale-[0.98] transition-transform"
          >
            返回词库
          </button>
        </div>
      )}
    </div>
  )
}
