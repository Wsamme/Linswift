import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Mic, MessageCircle, RotateCcw, Clock, Flame, Award,
  ChevronRight, Coffee, Plane, Stethoscope, Briefcase,
} from 'lucide-react'

/**
 * 口语练习汇总页 —— 口语模块入口
 * 功能：
 *  1. 累计口语时长、对话轮次、口语等级
 *  2. 练习模式入口：复述练习、AI 场景对话
 *  3. 快捷场景选择
 *  4. 今日口语任务
 */

// ===== 练习模式 =====
const modes = [
  { icon: RotateCcw, name: '复述练习', desc: '记忆优秀表达', color: '#FF8400', path: '/retell' },
  { icon: MessageCircle, name: 'AI 场景对话', desc: '与小林对话练习', color: '#3B82F6', path: '/scene-select' },
]

// ===== 快捷场景 =====
const quickScenes = [
  { icon: Coffee, name: '咖啡点单', color: '#FF8400' },
  { icon: Plane, name: '机场出行', color: '#3B82F6' },
  { icon: Stethoscope, name: '看医生', color: '#22C55E' },
  { icon: Briefcase, name: '工作面试', color: '#8B5CF6' },
]

// ===== 今日任务 =====
const todayTasks = [
  { title: '复述练习 - 商务场景', duration: '5 分钟', done: true },
  { title: 'AI 对话 - 咖啡点单', duration: '10 分钟', done: false },
  { title: '跟读训练 - TED 片段', duration: '3 分钟', done: false },
]

export default function SpeakingHubPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">口语练习</h1>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-3 gap-3 mx-5 mb-5">
        <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Clock size={18} className="text-[var(--color-primary)]" />
          <span className="text-[20px] font-bold text-[var(--color-primary)]">8.5h</span>
          <span className="text-[11px] text-[var(--color-muted)]">口语时长</span>
        </div>
        <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Flame size={18} className="text-[#EF4444]" />
          <span className="text-[20px] font-bold text-[#EF4444]">156</span>
          <span className="text-[11px] text-[var(--color-muted)]">对话轮次</span>
        </div>
        <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Award size={18} className="text-[var(--color-purple)]" />
          <span className="text-[20px] font-bold text-[var(--color-purple)]">B1</span>
          <span className="text-[11px] text-[var(--color-muted)]">口语等级</span>
        </div>
      </div>

      {/* ===== 练习模式入口 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">练习模式</h3>
        <div className="space-y-2">
          {modes.map((m, i) => (
            <button
              key={i}
              onClick={() => navigate(m.path)}
              className="w-full flex items-center gap-4 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-[0.98] transition-transform text-left"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${m.color}15` }}>
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

      {/* ===== 快捷场景 ===== */}
      <div className="mx-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold text-[var(--color-foreground)] font-secondary">快捷场景</h3>
          <button onClick={() => navigate('/scene-select')} className="text-[12px] text-[var(--color-primary)] font-semibold">
            全部 →
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {quickScenes.map((scene, i) => (
            <button
              key={i}
              onClick={() => navigate('/ai-dialog')}
              className="flex flex-col items-center gap-2 py-3 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-95 transition-transform"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <scene.icon size={22} style={{ color: scene.color }} />
              <span className="text-[11px] font-medium text-[var(--color-foreground)]">{scene.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== 今日任务 ===== */}
      <div className="mx-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary flex items-center gap-2">
          <Mic size={14} className="text-[var(--color-primary)]" /> 今日口语任务
        </h3>
        <div className="space-y-2">
          {todayTasks.map((task, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)]"
              style={{ boxShadow: 'var(--shadow-card)' }}>
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
        </div>
      </div>
    </div>
  )
}
