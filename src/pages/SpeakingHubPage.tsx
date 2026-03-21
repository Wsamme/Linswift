import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Mic, MessageCircle, RotateCcw, Clock, Flame, Award,
  ChevronRight, Coffee, Plane, Stethoscope, Briefcase, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'

const modes = [
  { icon: RotateCcw, name: '复述练习', desc: '来自 retell_prompts', color: '#FF8400', path: '/retell' },
  { icon: MessageCircle, name: 'AI 场景对话', desc: '来自 speaking_scenes', color: '#3B82F6', path: '/scene-select' },
]

const iconMap: Record<string, any> = {
  coffee: Coffee,
  plane: Plane,
  medical: Stethoscope,
  interview: Briefcase,
}

export default function SpeakingHubPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [scenes, setScenes] = useState<Array<{ id: number; name: string; icon: string }>>([])
  const [dialogues, setDialogues] = useState<Array<{ created_at: string; scene: string }>>([])

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      const [sceneRes, dialogueRes] = await Promise.all([
        supabase.from('speaking_scenes').select('id,name,icon').order('created_at', { ascending: false }).limit(8),
        supabase.from('speaking_dialogues').select('created_at,scene').eq('user_id', user.id).order('created_at', { ascending: false }),
      ])
      if (!sceneRes.error && sceneRes.data) setScenes(sceneRes.data as any)
      if (!dialogueRes.error && dialogueRes.data) setDialogues(dialogueRes.data as any)
      setLoading(false)
    }
    load()
  }, [user])

  const quickScenes = scenes.slice(0, 4)
  const totalRounds = dialogues.length
  const speakingHours = (totalRounds * 2 / 60).toFixed(1)
  const streakDays = useMemo(() => {
    const set = new Set(dialogues.map((d) => d.created_at.slice(0, 10)))
    let streak = 0
    const now = new Date()
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      if (set.has(iso)) streak += 1
      else break
    }
    return streak
  }, [dialogues])
  const level = totalRounds >= 100 ? 'B2' : totalRounds >= 30 ? 'B1' : 'A2'

  const todayTasks = scenes.slice(0, 3).map((scene) => ({
    title: `AI 对话 - ${scene.name}`,
    duration: '10 分钟',
    done: dialogues.some((d) => d.scene === scene.name),
  }))

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">口语练习</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-[var(--color-primary)]" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mx-5 mb-5">
            <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <Clock size={18} className="text-[var(--color-primary)]" />
              <span className="text-[20px] font-bold text-[var(--color-primary)]">{speakingHours}h</span>
              <span className="text-[11px] text-[var(--color-muted)]">口语时长</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <Flame size={18} className="text-[#EF4444]" />
              <span className="text-[20px] font-bold text-[#EF4444]">{streakDays}</span>
              <span className="text-[11px] text-[var(--color-muted)]">连续天数</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <Award size={18} className="text-[var(--color-purple)]" />
              <span className="text-[20px] font-bold text-[var(--color-purple)]">{level}</span>
              <span className="text-[11px] text-[var(--color-muted)]">口语等级</span>
            </div>
          </div>

          <div className="mx-5 mb-5">
            <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">练习模式</h3>
            <div className="space-y-2">
              {modes.map((m) => (
                <button
                  key={m.path}
                  onClick={() => navigate(m.path)}
                  className="w-full flex items-center gap-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-[0.98] transition-transform text-left"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0" style={{ backgroundColor: `${m.color}15` }}>
                    <m.icon size={24} style={{ color: m.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-[var(--color-foreground)]">{m.name}</p>
                    <p className="text-[12px] text-[var(--color-muted)]">{m.desc}</p>
                  </div>
                  <ChevronRight size={18} className="text-[var(--color-muted)]" />
                </button>
              ))}
            </div>
          </div>

          <div className="mx-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold text-[var(--color-foreground)] font-secondary">快捷场景</h3>
              <button onClick={() => navigate('/scene-select')} className="text-[12px] text-[var(--color-primary)] font-semibold">全部 →</button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {quickScenes.map((scene) => {
                const Icon = iconMap[scene.icon] || MessageCircle
                return (
                  <button
                    key={scene.id}
                    onClick={() => navigate('/ai-dialog')}
                    className="flex flex-col items-center gap-2 py-3 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-95 transition-transform"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                  >
                    <Icon size={22} className="text-[var(--color-primary)]" />
                    <span className="text-[11px] font-medium text-[var(--color-foreground)]">{scene.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mx-5 pb-8">
            <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary flex items-center gap-2">
              <Mic size={14} className="text-[var(--color-primary)]" /> 今日口语任务
            </h3>
            <div className="space-y-2">
              {todayTasks.map((task, i) => (
                <div key={`${task.title}-${i}`} className="flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)]" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    task.done ? 'bg-[var(--color-success)] border-[var(--color-success)]' : 'border-[var(--color-border-dark)]'
                  }`}>
                    {task.done && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className={`text-[13px] font-medium ${task.done ? 'text-[var(--color-muted)] line-through' : 'text-[var(--color-foreground)]'}`}>{task.title}</p>
                  </div>
                  <span className="text-[11px] text-[var(--color-muted)]">{task.duration}</span>
                </div>
              ))}
              {todayTasks.length === 0 && <p className="text-[12px] text-[var(--color-muted)]">暂无场景数据，请先向 `speaking_scenes` 写入数据。</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
