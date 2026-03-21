import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ExternalLink,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getGrammarBlueprint } from '../data/grammarCatalog'
import { longSentenceReadingItems } from '../data/longSentences'
import { useGrammarLearning } from '../hooks/useGrammarLearning'
import { useLogicalBack } from '../hooks/useLogicalBack'
import {
  GRAMMAR_ERROR_LABELS,
  evaluateGrammarExercise,
  getNodeDueReviewCount,
  type GrammarExercise,
} from '../lib/grammar'

interface GrammarNode {
  node_id: string
  name: string
  description: string
  order_index: number
}

interface GrammarResource {
  id: number
  type: 'video' | 'article' | 'exercise'
  title: string
  summary: string | null
  url: string
  provider: string | null
}

function cleanNodeName(name: string) {
  return name.replace(/^\[[A-Z0-9]+\]\s*/, '').trim()
}

function renderExerciseInput(
  exercise: GrammarExercise,
  value: string,
  disabled: boolean,
  onChange: (nextValue: string) => void,
) {
  if (exercise.type === 'choice') {
    return (
      <div className="space-y-2">
        {exercise.options.map((option, optionIndex) => {
          const selected = value === String(optionIndex)
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onChange(String(optionIndex))}
              className={`w-full rounded-[16px] border px-4 py-3 text-left text-[13px] transition-colors ${
                selected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-foreground)]'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <span className="mr-2 text-[var(--color-muted)]">{String.fromCharCode(65 + optionIndex)}.</span>
              {option}
            </button>
          )
        })}
      </div>
    )
  }

  if (exercise.type === 'correction') {
    return (
      <div className="space-y-3">
        <div className="rounded-[16px] bg-[#FFF4F4] px-4 py-3 text-[13px] leading-6 text-[#B91C1C]">
          原句：{exercise.sourceSentence}
        </div>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder="输入你修正后的句子"
          className="w-full rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-800 outline-none focus:border-[var(--color-primary)]"
        />
      </div>
    )
  }

  const placeholder = exercise.type === 'rewrite'
    ? exercise.hint ?? '输入你的句子'
    : exercise.placeholder ?? '输入答案'

  if (exercise.type === 'rewrite') {
    return (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="min-h-[112px] w-full rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-[13px] leading-6 text-slate-800 outline-none focus:border-[var(--color-primary)]"
      />
    )
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-800 outline-none focus:border-[var(--color-primary)]"
    />
  )
}

export default function GrammarLessonPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/grammar')
  const { user } = useAuth()
  const { state: grammarState, submit } = useGrammarLearning(user?.id)
  const [searchParams] = useSearchParams()
  const nodeId = searchParams.get('id') || ''

  const [loading, setLoading] = useState(true)
  const [node, setNode] = useState<GrammarNode | null>(null)
  const [resources, setResources] = useState<GrammarResource[]>([])
  const [errorText, setErrorText] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [resultMap, setResultMap] = useState<Record<string, boolean>>({})
  const [score, setScore] = useState(0)

  useEffect(() => {
    async function load() {
      if (!nodeId) {
        setErrorText('缺少语法节点 id')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorText(null)

      const [nodeRes, resourceRes] = await Promise.all([
        supabase
          .from('grammar_nodes')
          .select('node_id,name,description,order_index')
          .eq('node_id', nodeId)
          .maybeSingle(),
        supabase
          .from('grammar_resources')
          .select('id,type,title,summary,url,provider')
          .eq('node_id', nodeId)
          .order('order_index', { ascending: true }),
      ])

      if (nodeRes.error) {
        setErrorText(nodeRes.error.message)
        setLoading(false)
        return
      }
      if (!nodeRes.data) {
        setErrorText('未找到该语法节点')
        setLoading(false)
        return
      }

      setNode(nodeRes.data as GrammarNode)
      setResources(resourceRes.error || !resourceRes.data ? [] : resourceRes.data as GrammarResource[])
      setAnswers({})
      setSubmitted(false)
      setScore(0)
      setResultMap({})
      setLoading(false)
    }

    void load()
  }, [nodeId])

  const blueprint = useMemo(() => getGrammarBlueprint(nodeId), [nodeId])
  const requiredExercises = useMemo(
    () => blueprint?.exercises.filter((exercise) => exercise.required !== false) ?? [],
    [blueprint],
  )
  const relatedReadings = useMemo(
    () => longSentenceReadingItems.filter((item) => blueprint?.longSentenceReadingIds.includes(item.id)),
    [blueprint],
  )
  const nodeSnapshot = node ? grammarState.nodeSnapshots[node.node_id] : null
  const nodeDueReviews = node ? getNodeDueReviewCount(grammarState, node.node_id) : 0

  const nodeWeaknesses = useMemo(() => {
    if (!blueprint) return []
    return blueprint.units
      .flatMap((unit) => unit.errorTags)
      .filter((tag, index, array) => array.indexOf(tag) === index)
      .map((tag) => ({
        tag,
        label: GRAMMAR_ERROR_LABELS[tag] ?? tag,
        count: grammarState.errorStats[tag]?.wrongCount ?? 0,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [blueprint, grammarState.errorStats])

  async function persistLegacyProgress(accuracy: number) {
    if (!user || !node) return
    const status = accuracy >= 0.7 ? 'completed' : 'in_progress'

    await supabase.from('grammar_progress').upsert(
      {
        user_id: user.id,
        node_id: node.node_id,
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,node_id' },
    )

    if (status === 'completed') {
      const nextNodeRes = await supabase
        .from('grammar_nodes')
        .select('node_id')
        .gt('order_index', node.order_index)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!nextNodeRes.error && nextNodeRes.data?.node_id) {
        const nextNodeId = nextNodeRes.data.node_id as string
        const nextProgressRes = await supabase
          .from('grammar_progress')
          .select('status')
          .eq('user_id', user.id)
          .eq('node_id', nextNodeId)
          .maybeSingle()
        const currentStatus = nextProgressRes.data?.status

        if (!nextProgressRes.error && (!currentStatus || currentStatus === 'locked')) {
          await supabase.from('grammar_progress').upsert(
            {
              user_id: user.id,
              node_id: nextNodeId,
              status: 'in_progress',
              completed_at: null,
            },
            { onConflict: 'user_id,node_id' },
          )
        }
      }
    }
  }

  async function handleSubmitQuiz() {
    if (!blueprint || requiredExercises.length === 0 || submitted || !node) return

    const nextResultMap: Record<string, boolean> = {}
    let nextScore = 0

    const results = requiredExercises.map((exercise) => {
      const answer = answers[exercise.id] ?? ''
      const correct = evaluateGrammarExercise(exercise, answer)
      nextResultMap[exercise.id] = correct
      if (correct) nextScore += 1

      return {
        exerciseId: exercise.id,
        answer,
        correct,
        errorTag: exercise.errorTag,
      }
    })

    const accuracy = requiredExercises.length > 0 ? nextScore / requiredExercises.length : 0
    setResultMap(nextResultMap)
    setScore(nextScore)
    setSubmitted(true)

    await Promise.all([
      persistLegacyProgress(accuracy),
      submit({
        nodeId: node.node_id,
        requiredResults: results,
        accuracy,
      }),
    ])
  }

  function resetQuiz() {
    setAnswers({})
    setSubmitted(false)
    setScore(0)
    setResultMap({})
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FFF9F2_0%,#F8FAFC_40%,#F8FAFC_100%)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Grammar Workshop</div>
          <h1 className="truncate text-[18px] font-bold text-[var(--color-foreground)] font-secondary">
            {node?.name ? cleanNodeName(node.name) : '语法课程'}
          </h1>
          {node?.description && <p className="truncate text-[12px] text-[var(--color-muted)]">{node.description}</p>}
        </div>
      </div>

      <div className="space-y-5 px-5 pb-8">
        {errorText && (
          <div className="rounded-[24px] bg-white px-5 py-4 text-[13px] text-[var(--color-error)] shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            {errorText}
          </div>
        )}

        {!errorText && node && blueprint && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.35fr,0.65fr]">
              <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#FFF2E6] px-3 py-1.5 text-[11px] font-semibold text-[#C86A00]">
                    {blueprint.level} · {blueprint.cluster}
                  </span>
                  {nodeDueReviews > 0 && (
                    <span className="rounded-full bg-[#FFF1F2] px-3 py-1.5 text-[11px] font-semibold text-[#E11D48]">
                      待复习 {nodeDueReviews}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[24px] font-bold leading-tight text-slate-900">{blueprint.summary}</div>
                <div className="mt-3 text-[14px] leading-7 text-slate-600">
                  这一课已经改成完整路径：先看规则骨架，再做场景辨析，最后通过改错和输出练习把规则固定下来。
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
                  <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">结构单元 {blueprint.units.length}</span>
                  <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">核心题 {requiredExercises.length}</span>
                  <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">输出练习 {blueprint.workshops.length}</span>
                  <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">掌握度 {nodeSnapshot?.mastery ?? 0}%</span>
                </div>
              </div>

              <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">Current Focus</div>
                <div className="mt-3 space-y-3">
                  {blueprint.units.map((unit, index) => (
                    <div key={unit.id} className="rounded-[18px] bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-semibold text-[var(--color-primary)]">Step {index + 1}</div>
                      <div className="mt-1 text-[14px] font-bold text-slate-900">{unit.title}</div>
                      <div className="mt-1 text-[12px] leading-6 text-slate-500">{unit.objective}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
              <div className="space-y-4">
                <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[18px] font-bold text-slate-900">学习路径</h2>
                    <div className="text-[12px] text-slate-500">从形式到输出</div>
                  </div>
                  <div className="space-y-4">
                    {blueprint.units.map((unit) => (
                      <div key={unit.id} className="rounded-[22px] border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 size={16} className="mt-1 shrink-0 text-[var(--color-primary)]" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[16px] font-bold text-slate-900">{unit.title}</div>
                            <div className="mt-1 text-[13px] leading-6 text-slate-500">{unit.objective}</div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Rule</div>
                                <div className="mt-2 space-y-1.5">
                                  {unit.formula.map((item) => (
                                    <div key={item} className="rounded-[12px] bg-white px-3 py-2 text-[13px] text-slate-700">{item}</div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Contrast</div>
                                <div className="mt-2 space-y-1.5">
                                  {unit.contrast.map((item) => (
                                    <div key={item} className="rounded-[12px] bg-white px-3 py-2 text-[13px] text-slate-700">{item}</div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Use Cases</div>
                                <div className="mt-2 space-y-1.5">
                                  {unit.scenarios.map((item) => (
                                    <div key={item} className="rounded-[12px] bg-[#FFF8F1] px-3 py-2 text-[13px] text-[#A16207]">{item}</div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Common Mistakes</div>
                                <div className="mt-2 space-y-1.5">
                                  {unit.commonMistakes.map((item) => (
                                    <div key={item} className="rounded-[12px] bg-[#FFF1F2] px-3 py-2 text-[13px] text-[#BE123C]">{item}</div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[18px] font-bold text-slate-900">高频例句</h2>
                    <div className="text-[12px] text-slate-500">短句 + 长难句联动</div>
                  </div>
                  <div className="space-y-3">
                    {blueprint.examples.map((item) => (
                      <div key={item.id} className="rounded-[20px] border border-slate-100 bg-slate-50 p-4">
                        <div className="text-[15px] font-semibold leading-7 text-slate-900">{item.sentence}</div>
                        <div className="mt-2 text-[13px] leading-6 text-slate-600">{item.translation}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] text-slate-500">{item.note}</span>
                          {item.linkedReadingId && (
                            <button
                              onClick={() => navigate(`/grammar/long-sentence/reading?id=${encodeURIComponent(item.linkedReadingId ?? '')}`)}
                              className="inline-flex items-center gap-1 rounded-full bg-[#EEF4FF] px-3 py-1 text-[11px] font-semibold text-[#2855C5]"
                            >
                              去看长难句
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">Adaptive Review</div>
                  <div className="mt-3 text-[18px] font-bold text-slate-900">错因反馈</div>
                  {nodeWeaknesses.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {nodeWeaknesses.map((item) => (
                        <div key={item.tag} className="rounded-[16px] bg-slate-50 px-4 py-3">
                          <div className="text-[13px] font-semibold text-slate-900">{item.label}</div>
                          <div className="mt-1 text-[12px] text-slate-500">累计错误 {item.count} 次</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-[13px] leading-6 text-slate-500">
                      还没有这一课的错因画像。做完下方核心题后，这里会开始记录你最容易错的规则标签。
                    </div>
                  )}
                </div>

                <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                  <div className="mb-3 text-[18px] font-bold text-slate-900">外部资源</div>
                  <div className="space-y-3">
                    {resources.length > 0 ? resources.map((resource) => (
                      <a
                        key={resource.id}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-[14px] font-semibold text-slate-900">{resource.title}</div>
                            <div className="mt-1 text-[12px] text-slate-500">{resource.provider ?? resource.type}</div>
                          </div>
                          <ExternalLink size={14} className="text-slate-400" />
                        </div>
                        {resource.summary && <div className="mt-2 text-[12px] leading-6 text-slate-500">{resource.summary}</div>}
                      </a>
                    )) : (
                      <div className="rounded-[18px] bg-slate-50 px-4 py-3 text-[13px] leading-6 text-slate-500">
                        当前节点还没有单独挂资源，先完成本课结构化内容和练习。
                      </div>
                    )}
                  </div>
                </div>

                {relatedReadings.length > 0 && (
                  <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                    <div className="mb-3 text-[18px] font-bold text-slate-900">相关长难句</div>
                    <div className="space-y-3">
                      {relatedReadings.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => navigate(`/grammar/long-sentence/reading?id=${encodeURIComponent(item.id)}`)}
                          className="w-full rounded-[18px] border border-slate-100 bg-slate-50 px-4 py-3 text-left"
                        >
                          <div className="text-[13px] font-semibold text-[var(--color-primary)]">{item.focus}</div>
                          <div className="mt-1 text-[15px] font-bold text-slate-900">{item.title}</div>
                          <div className="mt-2 line-clamp-2 text-[12px] leading-6 text-slate-500">{item.sentence}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[18px] font-bold text-slate-900">混合练习</h2>
                  <div className="mt-1 text-[13px] text-slate-500">核心题计入掌握度；输出题不计分，但建议完成。</div>
                </div>
                <div className="rounded-full bg-slate-50 px-3 py-1.5 text-[12px] text-slate-500">
                  核心题 {requiredExercises.length} / 总练习 {blueprint.exercises.length}
                </div>
              </div>

              <div className="space-y-4">
                {blueprint.exercises.map((exercise, index) => {
                  const chosen = answers[exercise.id] ?? ''
                  const isCorrect = resultMap[exercise.id]
                  const showResult = submitted && exercise.required !== false

                  return (
                    <div key={exercise.id} className="rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500">
                          {index + 1}. {exercise.title}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          exercise.required !== false
                            ? 'bg-[#EEF4FF] text-[#2855C5]'
                            : 'bg-[#FFF7ED] text-[#C86A00]'
                        }`}>
                          {exercise.required !== false ? '核心题' : '输出题'}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-500">
                          {GRAMMAR_ERROR_LABELS[exercise.errorTag] ?? exercise.errorTag}
                        </span>
                      </div>
                      <div className="mb-3 text-[14px] font-semibold leading-7 text-slate-900">{exercise.prompt}</div>

                      {renderExerciseInput(
                        exercise,
                        chosen,
                        submitted && exercise.required !== false,
                        (nextValue) => setAnswers((prev) => ({ ...prev, [exercise.id]: nextValue })),
                      )}

                      {exercise.type === 'rewrite' && (
                        <div className="mt-3 rounded-[14px] bg-white px-3 py-3 text-[12px] leading-6 text-slate-500">
                          自检清单：{exercise.checklist.join(' / ')}
                        </div>
                      )}

                      {(showResult || (submitted && exercise.type === 'rewrite')) && (
                        <div className="mt-3 flex items-start gap-2 text-[12px]">
                          <Circle size={12} className={`mt-1 shrink-0 ${showResult ? (isCorrect ? 'text-[#16A34A]' : 'text-[#DC2626]') : 'text-[var(--color-primary)]'}`} />
                          <div className="leading-6 text-slate-500">
                            {showResult && (
                              <div className={`font-semibold ${isCorrect ? 'text-[#15803D]' : 'text-[#B91C1C]'}`}>
                                {isCorrect ? '回答正确' : '还没命中这条规则'}
                              </div>
                            )}
                            <div>
                              解析：
                              {exercise.type === 'rewrite'
                                ? ' 先检查句子主干、目标结构和语境是否完整，再用参考输出对照表达方式。'
                                : ` ${exercise.explanation}`}
                            </div>
                            {exercise.type === 'rewrite' && (
                              <div className="mt-1">参考输出：{exercise.sampleAnswer}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {!submitted ? (
                <button
                  onClick={handleSubmitQuiz}
                  disabled={requiredExercises.some((exercise) => !(answers[exercise.id] ?? '').trim())}
                  className="mt-4 w-full rounded-[18px] bg-[var(--color-primary)] py-3 text-[14px] font-semibold text-white disabled:opacity-50"
                >
                  提交核心练习
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[22px] bg-[var(--color-primary-light)] px-4 py-4 text-center">
                    <p className="text-[12px] text-[var(--color-muted)]">核心练习结果</p>
                    <p className="text-[28px] font-bold text-[var(--color-primary)]">{score}/{requiredExercises.length}</p>
                    <p className="text-[12px] text-[var(--color-muted)]">
                      {requiredExercises.length > 0 && score / requiredExercises.length >= 0.7
                        ? '本课已标记为完成，下一节会继续解锁。'
                        : '本课已记为进行中，错因会进入语法复习队列。'}
                    </p>
                  </div>

                  <button
                    onClick={resetQuiz}
                    className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-slate-200 bg-white py-3 text-[14px] font-semibold text-slate-700"
                  >
                    <RotateCcw size={16} />
                    重新练习
                  </button>
                </div>
              )}
            </section>

            {blueprint.workshops.length > 0 && (
              <section className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles size={16} className="text-[var(--color-primary)]" />
                  <h2 className="text-[18px] font-bold text-slate-900">输出工作坊</h2>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {blueprint.workshops.map((item) => (
                    <div key={item.id} className="rounded-[20px] bg-slate-50 p-4">
                      <div className="text-[15px] font-bold text-slate-900">{item.title}</div>
                      <div className="mt-2 text-[13px] leading-6 text-slate-600">{item.prompt}</div>
                      <div className="mt-3 space-y-1.5">
                        {item.checklist.map((line) => (
                          <div key={line} className="rounded-[12px] bg-white px-3 py-2 text-[12px] text-slate-500">{line}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
