import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpenCheck,
  ChevronLeft,
  Check,
  Loader2,
  Lock,
  Play,
  Search,
  Sparkles,
  TimerReset,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { getGrammarBlueprint } from '../data/grammarCatalog'
import { useGrammarLearning } from '../hooks/useGrammarLearning'
import { navigateSafely } from '../lib/navigation'
import {
  GRAMMAR_ERROR_LABELS,
  getNodeDueReviewCount,
  getTopGrammarWeaknesses,
} from '../lib/grammar'

type NodeStatus = 'done' | 'active' | 'locked'

interface GrammarNode {
  node_id: string
  name: string
  description: string
  order_index: number
}

const statusColors = {
  done: { bg: '#22C55E', light: '#DCFCE7', text: '#15803D' },
  active: { bg: '#FF8400', light: '#FFF5EB', text: '#FF8400' },
  locked: { bg: '#D1D5DB', light: '#F3F4F6', text: '#9CA3AF' },
}

function cleanNodeName(name: string) {
  return name.replace(/^\[[A-Z0-9]+\]\s*/, '').trim()
}

export default function GrammarTreePage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const { state: grammarState } = useGrammarLearning(user?.id)
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes] = useState<GrammarNode[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, NodeStatus>>({})

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      const [nodeRes, progressRes] = await Promise.all([
        supabase.from('grammar_nodes').select('*').order('order_index', { ascending: true }),
        supabase.from('grammar_progress').select('node_id,status').eq('user_id', user.id),
      ])
      if (!nodeRes.error && nodeRes.data) setNodes(nodeRes.data as GrammarNode[])
      if (!progressRes.error && progressRes.data) {
        const map: Record<string, NodeStatus> = {}
        progressRes.data.forEach((row: { node_id: string; status: string }) => {
          map[row.node_id] = row.status === 'completed' ? 'done' : row.status === 'in_progress' ? 'active' : 'locked'
        })
        setProgressMap(map)
      }
      setLoading(false)
    }
    void load()
  }, [user])

  const treeNodes = useMemo(() => {
    const completed = new Set<string>()
    const derived: Array<GrammarNode & {
      status: NodeStatus
      blueprintMissing: boolean
      mastery: number
      dueReviews: number
      exerciseCount: number
      workshopCount: number
      level: string
      cluster: string
    }> = []
    let hasActive = false

    nodes.forEach((node, index) => {
      const blueprint = getGrammarBlueprint(node.node_id)
      const localSnapshot = grammarState.nodeSnapshots[node.node_id]
      const explicit = progressMap[node.node_id]
      const isDone = explicit === 'done' || Boolean(localSnapshot?.completedAt)
      const prerequisiteNodeIds = blueprint?.prerequisiteNodeIds ?? (index > 0 ? [nodes[index - 1].node_id] : [])
      const prerequisitesReady = prerequisiteNodeIds.every((id) => completed.has(id))

      let status: NodeStatus = 'locked'
      if (isDone) {
        status = 'done'
        completed.add(node.node_id)
      } else if ((index === 0 || prerequisitesReady || explicit === 'active') && !hasActive) {
        status = 'active'
        hasActive = true
      }

      derived.push({
        ...node,
        status,
        blueprintMissing: !blueprint,
        mastery: localSnapshot?.mastery ?? 0,
        dueReviews: getNodeDueReviewCount(grammarState, node.node_id),
        exerciseCount: blueprint?.exercises.filter((exercise) => exercise.required !== false).length ?? 0,
        workshopCount: blueprint?.workshops.length ?? 0,
        level: blueprint?.level ?? node.name.match(/\[([A-Z0-9]+)\]/)?.[1] ?? 'A1',
        cluster: blueprint?.cluster ?? '语法节点',
      })
    })

    return derived
  }, [grammarState, nodes, progressMap])

  const completedCount = treeNodes.filter((node) => node.status === 'done').length
  const dueReviewCount = treeNodes.reduce((sum, node) => sum + node.dueReviews, 0)
  const totalExercises = treeNodes.reduce((sum, node) => sum + node.exerciseCount, 0)
  const topWeaknesses = getTopGrammarWeaknesses(grammarState, 3)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FFF9F2_0%,#F8FAFC_40%,#F8FAFC_100%)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">语法学习路径</h1>
        <button className="p-1">
          <Search size={20} className="text-[var(--color-muted)]" />
        </button>
      </div>

      <div className="grid gap-4 px-5 md:grid-cols-3">
        <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">Grammar Path</div>
          <div className="mt-2 text-[30px] font-bold text-slate-900">{completedCount}/{treeNodes.length}</div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[var(--color-primary)] transition-all" style={{ width: `${treeNodes.length ? (completedCount / treeNodes.length) * 100 : 0}%` }} />
          </div>
          <div className="mt-3 text-[13px] leading-6 text-slate-500">
            现在每个节点都拆成了规则骨架、场景辨析、易错修正三层，不再只是一页模板题。
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <TimerReset size={14} />
            Review Queue
          </div>
          <div className="mt-2 text-[30px] font-bold text-slate-900">{dueReviewCount}</div>
          <div className="mt-2 text-[13px] leading-6 text-slate-500">
            今日到点语法复习 {dueReviewCount} 条，当前路径累计题目 {totalExercises} 道，另含 {treeNodes.reduce((sum, node) => sum + node.workshopCount, 0)} 个输出练习。
          </div>
        </div>

        <div className="rounded-[28px] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            <Sparkles size={14} />
            Weak Spots
          </div>
          {topWeaknesses.length > 0 ? (
            <div className="mt-3 space-y-2">
              {topWeaknesses.map((item) => (
                <div key={item.errorTag} className="rounded-[18px] bg-slate-50 px-3 py-2">
                  <div className="text-[13px] font-semibold text-slate-900">{GRAMMAR_ERROR_LABELS[item.errorTag] ?? item.errorTag}</div>
                  <div className="mt-1 text-[12px] text-slate-500">错过 {item.wrongCount} 次，修正成功 {item.correctedCount} 次</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-[13px] leading-6 text-slate-500">还没有形成明显错因分布。做完 1 到 2 节后，这里会开始显示你的薄弱项。</div>
          )}
        </div>
      </div>

      <div className="mx-5 mt-5 rounded-[28px] bg-[linear-gradient(135deg,#111827,#334155)] p-5 text-white shadow-[0_18px_36px_rgba(15,23,42,0.18)]">
        <div className="text-[11px] font-semibold tracking-[0.16em] text-white/70">LONG SENTENCE LOOP</div>
        <div className="mt-2 text-[24px] font-bold leading-tight">长难句现在会反向喂给语法路径</div>
        <div className="mt-2 text-[13px] leading-7 text-white/75">
          每个语法课都可以跳去相关长难句例句，长难句页也会回链到对应语法点，避免语法和阅读各练各的。
        </div>
        <button
          onClick={() => navigateSafely(navigate, '/grammar/long-sentence')}
          className="mt-5 rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-900 active:scale-[0.98]"
        >
          进入长难句学习
        </button>
      </div>

      <div className="px-5 pb-8 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-[var(--color-foreground)] font-secondary">知识树</h3>
          <div className="text-[12px] text-[var(--color-muted)]">按依赖关系逐步解锁</div>
        </div>
        <div className="flex flex-col items-center">
          {treeNodes.map((node, index) => {
            const colors = statusColors[node.status]
            const NodeIcon = node.status === 'done' ? Check : node.status === 'active' ? Play : Lock
            const isLast = index === treeNodes.length - 1

            return (
              <div key={node.node_id} className="flex w-full flex-col items-center">
                <div
                  className={`w-full rounded-[26px] border p-4 transition-transform ${node.status !== 'locked' ? 'cursor-pointer active:scale-[0.99]' : 'opacity-60'}`}
                  style={{
                    backgroundColor: colors.light,
                    borderColor: node.status === 'active' ? colors.bg : 'transparent',
                  }}
                  onClick={() => {
                    if (node.status === 'locked') return
                    navigateSafely(navigate, `/grammar/lesson?id=${encodeURIComponent(node.node_id)}`)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: colors.bg }}>
                      <NodeIcon size={18} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: colors.text }}>
                          {node.level}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted)]">{node.cluster}</span>
                        {node.dueReviews > 0 && (
                          <span className="rounded-full bg-[#FFF0F0] px-2.5 py-1 text-[10px] font-semibold text-[#DC2626]">
                            待复习 {node.dueReviews}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-[16px] font-bold" style={{ color: colors.text }}>{cleanNodeName(node.name)}</p>
                      <p className="mt-1 text-[12px] leading-6 text-[var(--color-muted)]">{node.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--color-muted)]">
                        <span className="rounded-full bg-white/70 px-3 py-1.5">结构单元 {node.blueprintMissing ? 0 : 3}</span>
                        <span className="rounded-full bg-white/70 px-3 py-1.5">核心题 {node.exerciseCount}</span>
                        <span className="rounded-full bg-white/70 px-3 py-1.5">输出练习 {node.workshopCount}</span>
                        <span className="rounded-full bg-white/70 px-3 py-1.5">掌握度 {node.mastery}%</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {node.status === 'active' && (
                        <span className="inline-flex rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white">
                          继续学习
                        </span>
                      )}
                      {node.status === 'done' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEFCEF] px-3 py-1.5 text-[11px] font-semibold text-[#15803D]">
                          <BookOpenCheck size={12} />
                          已完成
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!isLast && (
                  <div className="my-1 h-6 w-0.5" style={{ backgroundColor: treeNodes[index + 1].status === 'locked' ? '#D1D5DB' : index < completedCount ? '#22C55E' : '#FF8400' }} />
                )}
              </div>
            )
          })}
          {treeNodes.length === 0 && (
            <p className="text-[12px] text-[var(--color-muted)]">
              暂无语法节点，请先执行 `supabase-seed-grammar-nodes.sql` 初始化语法功能树。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
