import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Music, Radio, Library, Clock, Flame, Target,
  ChevronRight,
} from 'lucide-react'

/**
 * 听力练习汇总页 —— 听力模块入口
 * 功能：
 *  1. 累计听力时长、连续天数、正确率
 *  2. 三个子模块入口：听歌填字、随行听、听·图书馆
 *  3. 今日听力任务
 *  4. 推荐内容
 */

// ===== 子模块入口 =====
const modules = [
  { icon: Music, name: '听歌填字', desc: '边听边填，趣味听力', color: '#FF8400', path: '/listen-fill' },
  { icon: Radio, name: '随行听', desc: 'TED/新闻/课程', color: '#3B82F6', path: '/listen-go' },
  { icon: Library, name: '听·图书馆', desc: 'AI 博客 & 图书转化', color: '#8B5CF6', path: '/listen-lib' },
]

// ===== 今日任务 =====
const todayTasks = [
  { title: '听力理解 - TED Talk', duration: '5 分钟', done: true },
  { title: '歌词填空 - Shape of You', duration: '3 分钟', done: false },
  { title: '新闻听力 - BBC News', duration: '8 分钟', done: false },
]

// ===== 推荐内容 =====
const recommendations = [
  { title: 'Why We Sleep', source: 'TED Talk', duration: '12:34', difficulty: 'B1', thumb: '🎤' },
  { title: 'Shape of You', source: 'Ed Sheeran', duration: '3:54', difficulty: 'A2', thumb: '🎵' },
  { title: 'AI Revolution', source: 'BBC News', duration: '8:20', difficulty: 'B2', thumb: '📰' },
]

export default function ListeningHubPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">听力练习</h1>
      </div>

      {/* ===== 统计卡片 ===== */}
      <div className="grid grid-cols-3 gap-3 mx-5 mb-5">
        <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Clock size={18} className="text-[var(--color-primary)]" />
          <span className="text-[20px] font-bold text-[var(--color-primary)]">12.5h</span>
          <span className="text-[11px] text-[var(--color-muted)]">累计时长</span>
        </div>
        <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Flame size={18} className="text-[#EF4444]" />
          <span className="text-[20px] font-bold text-[#EF4444]">15</span>
          <span className="text-[11px] text-[var(--color-muted)]">连续天数</span>
        </div>
        <div className="flex flex-col items-center gap-1 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Target size={18} className="text-[var(--color-success)]" />
          <span className="text-[20px] font-bold text-[var(--color-success)]">78%</span>
          <span className="text-[11px] text-[var(--color-muted)]">正确率</span>
        </div>
      </div>

      {/* ===== 子模块入口 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">练习模式</h3>
        <div className="space-y-2">
          {modules.map((m, i) => (
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

      {/* ===== 今日听力任务 ===== */}
      <div className="mx-5 mb-5">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">今日任务</h3>
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

      {/* ===== 推荐内容 ===== */}
      <div className="mx-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">推荐</h3>
        <div className="space-y-2">
          {recommendations.map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-[var(--color-card)] rounded-[var(--radius-sm)] cursor-pointer active:bg-[var(--color-background-secondary)] transition-colors"
              style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="w-12 h-12 rounded-[10px] bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                <span className="text-[20px]">{item.thumb}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[var(--color-foreground)] line-clamp-1">{item.title}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{item.source} · {item.duration}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-[var(--color-background-secondary)] rounded text-[var(--color-muted)] shrink-0">
                {item.difficulty}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
