import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Coffee, Plane, Stethoscope, Briefcase, Hotel,
  ShoppingCart, GraduationCap, Pin, Sparkles,
} from 'lucide-react'

/**
 * 场景选择 —— 口语模块
 * 功能：
 *  1. 快捷置顶场景
 *  2. AI 能力评估六维雷达图（简化版，用 CSS 实现）
 *  3. AI 建议
 *  4. 全部场景列表
 */

// ===== 置顶场景 =====
const pinnedScenes = [
  { icon: Coffee, name: '咖啡店', color: '#FF8400' },
  { icon: Plane, name: '机场', color: '#3B82F6' },
  { icon: Briefcase, name: '面试', color: '#8B5CF6' },
]

// ===== 全部场景 =====
const allScenes = [
  { icon: Coffee, name: '咖啡店点单', desc: '学习点餐、付款常用表达', color: '#FF8400', level: 'A2' },
  { icon: Plane, name: '机场出行', desc: '值机、安检、登机对话', color: '#3B82F6', level: 'B1' },
  { icon: Stethoscope, name: '看医生', desc: '描述症状、了解诊断', color: '#22C55E', level: 'B1' },
  { icon: Hotel, name: '酒店入住', desc: '预订、入住、退房流程', color: '#FF8400', level: 'A2' },
  { icon: ShoppingCart, name: '超市购物', desc: '询价、找商品、结账', color: '#22C55E', level: 'A2' },
  { icon: Briefcase, name: '工作面试', desc: '自我介绍、回答常见问题', color: '#8B5CF6', level: 'B2' },
  { icon: GraduationCap, name: '课堂讨论', desc: '发表观点、提问、辩论', color: '#EF4444', level: 'B2' },
]

// ===== 六维数据 =====
const radarData = [
  { label: '流利', value: 72 },
  { label: '语法', value: 65 },
  { label: '词汇', value: 78 },
  { label: '会意', value: 70 },
  { label: '发音', value: 55 },
  { label: '逻辑', value: 68 },
]

export default function SceneSelectPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">场景选择</h1>
      </div>

      {/* ===== 快捷置顶 ===== */}
      <div className="px-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Pin size={14} className="text-[var(--color-primary)]" />
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">快捷置顶</span>
        </div>
        <div className="flex gap-3">
          {pinnedScenes.map((scene, i) => (
            <button
              key={i}
              onClick={() => navigate('/ai-dialog')}
              className="flex-1 flex flex-col items-center gap-2 py-4 bg-[var(--color-card)] rounded-[var(--radius-md)] active:scale-95 transition-transform"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <scene.icon size={24} style={{ color: scene.color }} />
              <span className="text-[12px] font-medium text-[var(--color-foreground)]">{scene.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ===== AI 能力评估 ===== */}
      <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
        style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-[var(--color-primary)]" />
          <span className="text-[13px] font-semibold text-[var(--color-foreground)]">AI 能力评估</span>
        </div>

        {/* 六维雷达图（简化版：用进度条显示） */}
        <div className="space-y-2.5 mb-4">
          {radarData.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-muted)] w-8 text-right shrink-0">{item.label}</span>
              <div className="flex-1 h-2 bg-[var(--color-background-secondary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${item.value}%`,
                    backgroundColor: item.label === '发音' ? '#EF4444' : '#FF8400',
                  }}
                />
              </div>
              <span className="text-[12px] font-semibold w-8 shrink-0" style={{
                color: item.label === '发音' ? '#EF4444' : '#FF8400'
              }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>

        {/* AI 建议 */}
        <div className="p-3 bg-[var(--color-primary-light)] rounded-[var(--radius-xs)]">
          <p className="text-[12px] text-[var(--color-foreground)] leading-relaxed">
            💡 <span className="font-semibold">AI 建议:</span> 你的发音得分较低，建议多进行
            <span className="text-[var(--color-primary)] font-semibold">复述练习</span>和
            <span className="text-[var(--color-primary)] font-semibold">跟读训练</span>，
            重点关注连读和重音。
          </p>
        </div>
      </div>

      {/* ===== 全部场景 ===== */}
      <div className="px-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary">全部场景</h3>
        <div className="space-y-2">
          {allScenes.map((scene, i) => (
            <button
              key={i}
              onClick={() => navigate('/ai-dialog')}
              className="w-full flex items-center gap-3 p-3.5 bg-[var(--color-card)] rounded-[var(--radius-sm)] active:scale-[0.98] transition-transform text-left"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <div className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${scene.color}15` }}>
                <scene.icon size={20} style={{ color: scene.color }} />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{scene.name}</p>
                <p className="text-[11px] text-[var(--color-muted)]">{scene.desc}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 bg-[var(--color-background-secondary)] rounded text-[var(--color-muted)] shrink-0">
                {scene.level}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
