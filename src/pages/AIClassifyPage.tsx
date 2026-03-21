import { useState, useEffect, useMemo } from 'react'
import {
  ChevronLeft, Sparkles, Loader2, RefreshCw,
  Briefcase, Plane, GraduationCap, Coffee, ShoppingCart, Stethoscope,
} from 'lucide-react'
import { classifyVocabulary } from '../services/gemini'
import { useVocabulary } from '../hooks/useVocabulary'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLogicalBack } from '../hooks/useLogicalBack'

const sceneIcons: Record<string, { icon: React.ElementType; color: string }> = {
  '商务办公': { icon: Briefcase, color: '#8B5CF6' },
  '旅行出行': { icon: Plane, color: '#3B82F6' },
  '学术研究': { icon: GraduationCap, color: '#22C55E' },
  '日常对话': { icon: Coffee, color: '#FF8400' },
  '购物消费': { icon: ShoppingCart, color: '#EF4444' },
  '医疗健康': { icon: Stethoscope, color: '#3B82F6' },
}

const defaultIcon = { icon: Sparkles, color: '#FF8400' }

export default function AIClassifyPage() {
  const goBack = useLogicalBack('/app/vocab')
  const { user } = useAuth()
  const { vocabulary, loading: vocabLoading } = useVocabulary()
  const [categories, setCategories] = useState<Record<string, string[]> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allWords = useMemo(() => {
    return vocabulary
      .map((item) => item.word?.trim())
      .filter((word): word is string => !!word)
      .slice(0, 80)
  }, [vocabulary])

  useEffect(() => {
    if (!vocabLoading && allWords.length > 0) {
      loadClassification()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vocabLoading, allWords.length])

  const persistSceneTags = async (result: Record<string, string[]>) => {
    if (!user) return
    const wordToScenes = new Map<string, string[]>()
    Object.entries(result).forEach(([scene, words]) => {
      words.forEach((word) => {
        const key = word.toLowerCase().trim()
        const existing = wordToScenes.get(key) || []
        if (!existing.includes(scene)) existing.push(scene)
        wordToScenes.set(key, existing)
      })
    })

    const updateRows = vocabulary
      .filter((item) => wordToScenes.has(item.word.toLowerCase()))
      .map((item) => ({
        id: item.id,
        scene_tags: wordToScenes.get(item.word.toLowerCase()) || null,
      }))

    if (updateRows.length > 0) {
      await Promise.all(
        updateRows.map((row) =>
          supabase
            .from('user_vocabulary')
            .update({ scene_tags: row.scene_tags })
            .eq('id', row.id)
            .eq('user_id', user.id)
        )
      )
    }
  }

  const loadClassification = async () => {
    if (allWords.length === 0) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await classifyVocabulary(allWords)
      setCategories(result)
      await persistSceneTags(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分类失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary flex items-center gap-2">
          AI 词汇分类 <Sparkles size={16} className="text-[var(--color-primary)]" />
        </h1>
        <button onClick={loadClassification} disabled={isLoading || allWords.length === 0} className="p-1">
          <RefreshCw size={20} className={`text-[var(--color-muted)] ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="mx-5 mb-4 p-3 bg-[var(--color-primary-light)] rounded-[var(--radius-sm)]">
        <p className="text-[12px] text-[var(--color-foreground)]">
          <Sparkles size={12} className="inline text-[var(--color-primary)] mr-1" />
          AI 已将你的 <span className="font-semibold text-[var(--color-primary)]">{allWords.length}</span> 个词汇按使用场景自动分类，并写入数据库 scene_tags
        </p>
      </div>

      {vocabLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={32} className="text-[var(--color-primary)] animate-spin mb-3" />
          <p className="text-[13px] text-[var(--color-muted)]">正在读取词库...</p>
        </div>
      )}

      {!vocabLoading && allWords.length === 0 && (
        <div className="mx-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-sm)] text-center">
          <p className="text-[13px] text-[var(--color-foreground)] mb-2">暂无可分类词汇</p>
          <p className="text-[12px] text-[var(--color-muted)]">请先在翻译或阅读中收集单词</p>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 size={32} className="text-[var(--color-primary)] animate-spin mb-3" />
          <p className="text-[13px] text-[var(--color-muted)]">AI 正在分析词汇...</p>
        </div>
      )}

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
