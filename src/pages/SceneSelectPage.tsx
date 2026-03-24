import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Coffee, Plane, Stethoscope, Briefcase, Hotel,
  ShoppingCart, GraduationCap, Pin, Sparkles, MessageCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'
import { navigateSafely } from '../lib/navigation'

const iconMap: Record<string, any> = {
  coffee: Coffee,
  plane: Plane,
  medical: Stethoscope,
  interview: Briefcase,
  hotel: Hotel,
  shopping: ShoppingCart,
  class: GraduationCap,
}

export default function SceneSelectPage() {
  const navigate = useNavigate()
  const goBack = useLogicalBack('/speaking')
  const { user } = useAuth()
  const [scenes, setScenes] = useState<Array<{ id: number; name: string; description: string; level: string; icon: string; pinned: boolean }>>([])
  const [dialogues, setDialogues] = useState<Array<{ scene: string; messages: any[] }>>([])

  useEffect(() => {
    async function load() {
      if (!user) return
      const [sceneRes, dialogueRes] = await Promise.all([
        supabase.from('speaking_scenes').select('*').order('created_at', { ascending: false }),
        supabase.from('speaking_dialogues').select('scene,messages').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      ])
      if (!sceneRes.error && sceneRes.data) setScenes(sceneRes.data as any)
      if (!dialogueRes.error && dialogueRes.data) setDialogues(dialogueRes.data as any)
    }
    load()
  }, [user])

  const pinnedScenes = scenes.filter((s) => s.pinned).slice(0, 3)
  const allScenes = scenes
  const totalMessages = dialogues.reduce((sum, d) => sum + ((d.messages || []).length), 0)
  const dimensions = useMemo(() => {
    const fluency = Math.min(95, 40 + dialogues.length * 2)
    const grammar = Math.min(92, 35 + Math.round(totalMessages / 4))
    const vocabulary = Math.min(96, 30 + scenes.length * 4)
    const listening = Math.min(90, 30 + dialogues.length)
    const pronunciation = Math.min(88, 25 + Math.round(totalMessages / 6))
    const logic = Math.min(90, 28 + dialogues.length)
    return [
      { label: '流利', value: fluency },
      { label: '语法', value: grammar },
      { label: '词汇', value: vocabulary },
      { label: '会意', value: listening },
      { label: '发音', value: pronunciation },
      { label: '逻辑', value: logic },
    ]
  }, [dialogues.length, totalMessages, scenes.length])

  const weakest = [...dimensions].sort((a, b) => a.value - b.value)[0]

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">场景选择</h1>
      </div>

      <div className="px-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Pin size={14} className="text-[var(--color-primary)]" />
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">快捷置顶</span>
        </div>
        <div className="flex gap-3">
          {pinnedScenes.map((scene) => {
            const Icon = iconMap[scene.icon] || MessageCircle
            return (
              <button
                key={scene.id}
                onClick={() => navigateSafely(navigate, '/ai-dialog')}
                className="flex-1 flex flex-col items-center gap-2 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-95 transition-transform"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <Icon size={24} className="text-[var(--color-primary)]" />
                <span className="text-[12px] font-medium text-[var(--color-foreground)]">{scene.name}</span>
              </button>
            )
          })}
          {pinnedScenes.length === 0 && <p className="text-[12px] text-[var(--color-muted)]">暂无置顶场景。</p>}
        </div>
      </div>

      <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">AI 能力评估</span>
        </div>
        <div className="space-y-2.5 mb-4">
          {dimensions.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-muted)] w-8 text-right shrink-0">{item.label}</span>
              <div className="flex-1 h-2 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${item.value}%`, backgroundColor: item.label === weakest.label ? '#EF4444' : '#FF8400' }}
                />
              </div>
              <span className="text-[12px] font-semibold w-8 shrink-0" style={{ color: item.label === weakest.label ? '#EF4444' : '#FF8400' }}>{item.value}</span>
            </div>
          ))}
        </div>
        <div className="p-3 bg-[var(--color-primary-light)] rounded-[var(--radius-xs)]">
          <p className="text-[12px] text-[var(--color-foreground)] leading-relaxed">
            💡 <span className="font-semibold">AI 建议:</span> 当前最弱维度是
            <span className="text-[var(--color-primary)] font-semibold"> {weakest.label}</span>，
            建议优先练习高频场景并完成至少 3 轮连续对话。
          </p>
        </div>
      </div>

      <div className="px-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">全部场景</h3>
        <div className="space-y-2">
          {allScenes.map((scene) => {
            const Icon = iconMap[scene.icon] || MessageCircle
            return (
              <button
                key={scene.id}
                onClick={() => navigateSafely(navigate, '/ai-dialog')}
                className="w-full flex items-center gap-3 p-3.5 bg-[var(--color-card)] rounded-[var(--radius-sm)] active:scale-[0.98] transition-transform text-left"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 bg-[var(--color-primary)]/15">
                  <Icon size={20} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{scene.name}</p>
                  <p className="text-[11px] text-[var(--color-muted)]">{scene.description || '场景口语练习'}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-[var(--color-background-secondary)] rounded text-[var(--color-muted)] shrink-0">{scene.level || 'A2'}</span>
              </button>
            )
          })}
          {allScenes.length === 0 && <p className="text-[12px] text-[var(--color-muted)]">暂无场景，请先向 `speaking_scenes` 写入数据。</p>}
        </div>
      </div>
    </div>
  )
}
