import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Sparkles, Loader2, RefreshCw,
  Briefcase, Plane, GraduationCap, Coffee, ShoppingCart, Stethoscope,
} from 'lucide-react'
import { classifyVocabulary } from '../services/gemini'

/**
 * AI 词汇分类 —— 词汇测试模块（接入 Gemini）
 * 功能：
 *  1. AI 自动将词库按场景分类
 *  2. 按场景卡片展示
 *  3. 支持刷新重新分类
 */

// ===== 词库数据 =====
const allWords = [
  'elaborate', 'phenomenon', 'comprehensive', 'accommodate', 'inevitable',
  'negotiate', 'deadline', 'itinerary', 'boarding', 'prescription',
  'curriculum', 'dissertation', 'revenue', 'fluctuate', 'sustainable',
]

// ===== 场景图标映射 =====
const sceneIcons: Record<string, { icon: React.ElementType; color: string }> = {
  '商务办公': { icon: Briefcase, color: '#8B5CF6' },
  '旅行出行': { icon: Plane, color: '#3B82F6' },
  '学术研究': { icon: GraduationCap, color: '#22C55E' },
  '日常对话': { icon: Coffee, color: '#FF8400' },
  '购物消费': { icon: ShoppingCart, color: '#EF4444' },
  '医疗健康': { icon: Stethoscope, color: '#3B82F6' },
}

// 默认图标
const defaultIcon = { icon: Sparkles, color: '#FF8400' }

export default function AIClassifyPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Record<string, string[]> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ===== 页面加载时自动分类 =====
  useEffect(() => {
    loadClassification()
  }, [])

  const loadClassification = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // 调用 Gemini AI 分类
      const result = await classifyVocabulary(allWords)
      setCategories(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分类失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary flex items-center gap-2">
          AI 词汇分类 <Sparkles size={16} className="text-[var(--color-primary)]" />
        </h1>
        <button onClick={loadClassification} disabled={isLoading} className="p-1">
          <RefreshCw size={20} className={`text-[var(--color-muted)] ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ===== 说明 ===== */}
      <div className="mx-5 mb-4 p-3 bg-[var(--color-primary-light)] rounded-[var(--radius-sm)]">
        <p className="text-[12px] text-[var(--color-foreground)]">
          <Sparkles size={12} className="inline text-[var(--color-primary)] mr-1" />
          AI 已将你的 <span className="font-semibold text-[var(--color-primary)]">{allWords.length}</span> 个词汇按使用场景自动分类
        </p>
      </div>

      {/* ===== 加载中 ===== */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={32} className="text-[var(--color-primary)] animate-spin mb-3" />
          <p className="text-[13px] text-[var(--color-muted)]">AI 正在分析词汇...</p>
        </div>
      )}

      {/* ===== 错误 ===== */}
      {error && (
        <div className="mx-5 p-4 bg-[var(--color-error)]/10 rounded-[var(--radius-sm)] text-center">
          <p className="text-[13px] text-[var(--color-error)] mb-2">{error}</p>
          <button
            onClick={loadClassification}
            className="text-[13px] text-[var(--color-primary)] font-semibold"
          >
            重试
          </button>
        </div>
      )}

      {/* ===== 分类结果 ===== */}
      {categories && !isLoading && (
        <div className="px-5 pb-8 space-y-4">
          {Object.entries(categories).map(([scene, words], i) => {
            const iconData = sceneIcons[scene] || defaultIcon
            const SceneIcon = iconData.icon

            return (
              <div
                key={i}
                className="p-4 bg-[var(--color-card)] rounded-[var(--radius-md)]"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                {/* 场景标题 */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-[8px] flex items-center justify-center"
                    style={{ backgroundColor: `${iconData.color}15` }}>
                    <SceneIcon size={16} style={{ color: iconData.color }} />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--color-foreground)]">{scene}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{words.length} 个单词</p>
                  </div>
                </div>

                {/* 单词标签 */}
                <div className="flex flex-wrap gap-2">
                  {words.map((word, j) => (
                    <span
                      key={j}
                      className="px-3 py-1.5 bg-[var(--color-background-secondary)] rounded-full text-[12px] font-medium text-[var(--color-foreground)]"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
