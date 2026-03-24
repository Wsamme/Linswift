import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Music, Radio, Library, Clock, Flame, Target,
  ChevronRight, Loader2,
} from 'lucide-react'
import { supabase, type ListeningContent } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { mergeListeningContent } from '../data/listeningContent'
import { navigateSafely } from '../lib/navigation'

const modules = [
  { icon: Music, name: '听歌填字', desc: '内置经典歌词训练 + 云端 music 内容', color: '#FF8400', path: '/listen-fill' },
  { icon: Radio, name: '随行听', desc: '内置 TED / 新闻 / 课程 / 学习素材，可直接播放', color: '#3B82F6', path: '/listen-go' },
  { icon: Library, name: '听·图书馆', desc: '统一浏览内置与云端听力内容', color: '#8B5CF6', path: '/listen-lib' },
]

export default function ListeningHubPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/app/learn')
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [contents, setContents] = useState<ListeningContent[]>([])
  const [completedIds, setCompletedIds] = useState<number[]>([])
  const [listeningMinutes, setListeningMinutes] = useState(0)
  const [streakDays, setStreakDays] = useState(0)

  useEffect(() => {
    async function load() {
      if (!user) return
      setLoading(true)
      const [contentRes, progressRes, studyRes] = await Promise.all([
        supabase.from('listening_content').select('*').order('created_at', { ascending: false }),
        supabase.from('listening_progress').select('content_id, completed').eq('user_id', user.id),
        supabase.from('study_records').select('study_date, listening_minutes').eq('user_id', user.id).order('study_date', { ascending: false }),
      ])

      setContents(mergeListeningContent(contentRes.error ? [] : (contentRes.data || [])))
      if (!progressRes.error && progressRes.data) {
        setCompletedIds(progressRes.data.filter((r) => r.completed).map((r) => r.content_id))
      }
      if (!studyRes.error && studyRes.data) {
        setListeningMinutes(studyRes.data.reduce((sum, row) => sum + (row.listening_minutes || 0), 0))
        const dateSet = new Set(studyRes.data.map((row) => row.study_date))
        let streak = 0
        const now = new Date()
        for (let i = 0; i < 365; i += 1) {
          const d = new Date(now)
          d.setDate(now.getDate() - i)
          const iso = d.toISOString().slice(0, 10)
          if (dateSet.has(iso)) streak += 1
          else break
        }
        setStreakDays(streak)
      }
      setLoading(false)
    }
    load()
  }, [user])

  const todayTasks = useMemo(() => {
    return contents.slice(0, 3).map((item) => ({
      title: item.title,
      duration: `${Math.max(1, Math.round((item.duration_seconds || 60) / 60))} 分钟`,
      done: completedIds.includes(item.id),
    }))
  }, [contents, completedIds])

  const recommendations = useMemo(() => {
    return contents.slice(0, 3)
  }, [contents])

  const totalHours = (listeningMinutes / 60).toFixed(1)
  const completionRate = contents.length > 0 ? Math.round((completedIds.length / contents.length) * 100) : 0

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听力练习</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mx-5 mb-5">
            <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <Clock size={18} className="text-[var(--color-primary)]" />
              <span className="text-[20px] font-bold text-[var(--color-primary)]">{totalHours}h</span>
              <span className="text-[11px] text-[var(--color-muted)]">累计时长</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <Flame size={18} className="text-[#EF4444]" />
              <span className="text-[20px] font-bold text-[#EF4444]">{streakDays}</span>
              <span className="text-[11px] text-[var(--color-muted)]">连续天数</span>
            </div>
            <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
              <Target size={18} className="text-[var(--color-success)]" />
              <span className="text-[20px] font-bold text-[var(--color-success)]">{completionRate}%</span>
              <span className="text-[11px] text-[var(--color-muted)]">完成率</span>
            </div>
          </div>

          <div className="mx-5 mb-5">
            <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">练习模式</h3>
            <div className="space-y-2">
              {modules.map((m) => (
                <button
                  key={m.path}
                  onClick={() => navigateSafely(navigate, m.path)}
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
            <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">今日任务</h3>
            <div className="space-y-2">
              {todayTasks.map((task, i) => (
                <div key={`${task.title}-${i}`} className="flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)]" style={{ boxShadow: 'var(--shadow-card)' }}>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    task.done ? 'bg-[var(--color-success)] border-[var(--color-success)]' : 'border-[var(--color-border-dark)]'
                  }`}>
                    {task.done && <span className="text-white text-[10px] font-bold">✓</span>}
                  </div>
                  <div className="flex-1">
                    <p className={`text-[13px] font-medium ${task.done ? 'text-[var(--color-muted)] line-through' : 'text-[var(--color-foreground)]'}`}>
                      {task.title}
                    </p>
                  </div>
                  <span className="text-[11px] text-[var(--color-muted)]">{task.duration}</span>
                </div>
              ))}
              {todayTasks.length === 0 && (
                <p className="text-[12px] text-[var(--color-muted)]">内置听力内容已经可用；后续还可以继续从 `listening_content` 扩充云端内容。</p>
              )}
            </div>
          </div>

          <div className="mx-5 pb-8">
            <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">推荐</h3>
            <div className="space-y-2">
              {recommendations.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigateSafely(navigate, '/listen-go')}
                  className="w-full flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)] cursor-pointer active:bg-[var(--color-background-secondary)] transition-colors"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <div className="w-12 h-12 rounded-[10px] bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                    <span className="text-[20px]">🎧</span>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[14px] font-semibold text-[var(--color-foreground)] line-clamp-1">{item.title}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{item.category} · {Math.max(1, Math.round((item.duration_seconds || 60) / 60))} 分钟</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-[var(--color-background-secondary)] rounded text-[var(--color-muted)] shrink-0">
                    {item.difficulty}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
