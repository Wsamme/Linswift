import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Check, Play, Lock, Search, Video, FileText,
} from 'lucide-react'

/**
 * 语法知识树 —— 语法模块
 * 功能：
 *  1. 学习进度概览卡片
 *  2. 知识树：纵向技能树布局
 *     - 已完成节点（绿色）
 *     - 学习中节点（橙色）
 *     - 未解锁节点（灰色）
 *  3. 每个节点显示视频数量 + 文章数量
 */

// ===== 知识树节点数据 =====
const treeNodes = [
  {
    id: 1, name: '基础句型', status: 'done' as const,
    icon: Check, videos: 5, articles: 3,
    desc: 'SVO 基本句式、there be、祈使句',
  },
  {
    id: 2, name: '时态入门', status: 'done' as const,
    icon: Check, videos: 8, articles: 5,
    desc: '一般现在/过去/将来时',
  },
  {
    id: 3, name: '名词与冠词', status: 'active' as const,
    icon: Play, videos: 6, articles: 4,
    desc: '可数/不可数名词、a/an/the',
  },
  {
    id: 4, name: '动词变位', status: 'active' as const,
    icon: Play, videos: 7, articles: 4,
    desc: '规则/不规则动词变化、助动词',
  },
  {
    id: 5, name: '形容词与副词', status: 'locked' as const,
    icon: Lock, videos: 5, articles: 3,
    desc: '比较级/最高级、位置规则',
  },
  {
    id: 6, name: '介词与连词', status: 'locked' as const,
    icon: Lock, videos: 4, articles: 3,
    desc: 'in/on/at、and/but/or/so',
  },
  {
    id: 7, name: '复合句', status: 'locked' as const,
    icon: Lock, videos: 6, articles: 5,
    desc: '定语从句、条件句、虚拟语气',
  },
]

// 节点颜色映射
const statusColors = {
  done: { bg: '#22C55E', light: '#DCFCE7', text: '#15803D' },
  active: { bg: '#FF8400', light: '#FFF5EB', text: '#FF8400' },
  locked: { bg: '#D1D5DB', light: '#F3F4F6', text: '#9CA3AF' },
}

export default function GrammarTreePage() {
  const navigate = useNavigate()

  const completedCount = treeNodes.filter(n => n.status === 'done').length

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">语法学习</h1>
        <button className="p-1">
          <Search size={20} className="text-[var(--color-muted)]" />
        </button>
      </div>

      {/* ===== 学习进度卡片 ===== */}
      <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
        style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[14px] font-semibold text-[var(--color-foreground)]">学习进度</span>
          <span className="text-[14px] text-[var(--color-primary)] font-bold">
            {completedCount}/{treeNodes.length} 课时
          </span>
        </div>
        <div className="h-2.5 bg-[var(--color-background-secondary)] rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-[var(--color-primary)] rounded-full transition-all"
            style={{ width: `${(completedCount / treeNodes.length) * 100}%` }}
          />
        </div>
        <div className="flex gap-4 text-[11px] text-[var(--color-muted)]">
          <span>📹 {treeNodes.reduce((s, n) => s + n.videos, 0)} 个视频</span>
          <span>📄 {treeNodes.reduce((s, n) => s + n.articles, 0)} 篇文章</span>
        </div>
      </div>

      {/* ===== 知识树 ===== */}
      <div className="px-5 pb-8">
        <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-4 font-secondary">知识树</h3>

        <div className="flex flex-col items-center">
          {treeNodes.map((node, i) => {
            const colors = statusColors[node.status]
            const NodeIcon = node.icon
            const isLast = i === treeNodes.length - 1

            return (
              <div key={node.id} className="flex flex-col items-center w-full">
                {/* 节点卡片 */}
                <div
                  className={`w-full flex items-center gap-3 p-3.5 rounded-[var(--radius-md)] transition-transform ${
                    node.status !== 'locked' ? 'cursor-pointer active:scale-[0.98]' : 'opacity-60'
                  }`}
                  style={{
                    backgroundColor: colors.light,
                    border: node.status === 'active' ? `2px solid ${colors.bg}` : '2px solid transparent',
                  }}
                >
                  {/* 状态图标 */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <NodeIcon size={18} className="text-white" />
                  </div>

                  {/* 信息 */}
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold" style={{ color: colors.text }}>{node.name}</p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{node.desc}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-[var(--color-muted)] flex items-center gap-1">
                        <Video size={10} /> {node.videos} 视频
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)] flex items-center gap-1">
                        <FileText size={10} /> {node.articles} 文章
                      </span>
                    </div>
                  </div>

                  {/* 进入按钮 */}
                  {node.status === 'active' && (
                    <span className="px-3 py-1.5 bg-[var(--color-primary)] text-white text-[11px] font-semibold rounded-full shrink-0">
                      继续
                    </span>
                  )}
                  {node.status === 'done' && (
                    <span className="text-[11px] text-[var(--color-success)] font-semibold shrink-0">已完成 ✓</span>
                  )}
                </div>

                {/* 连接线 */}
                {!isLast && (
                  <div
                    className="w-0.5 h-6 my-1"
                    style={{
                      backgroundColor: treeNodes[i + 1].status === 'locked' ? '#D1D5DB' : i < completedCount ? '#22C55E' : '#FF8400'
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
