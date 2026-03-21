import { useMemo, useState } from 'react'
import {
  ChevronLeft, Sparkles, RefreshCw, Volume2, Star, Clock, Loader2,
} from 'lucide-react'
import { chat } from '../services/gemini'
import { speakAuto, stopSpeaking, isSpeaking } from '../lib/tts'
import { useVocabulary } from '../hooks/useVocabulary'
import { useSavedMnemonics } from '../hooks/useSavedMnemonics'
import { useLogicalBack } from '../hooks/useLogicalBack'

export default function AIMemoPage() {
  const goBack = useLogicalBack('/ebbinghaus')
  const { vocabulary, loading: vocabLoading } = useVocabulary()
  const { mnemonics, loading: memoLoading, saveMnemonic } = useSavedMnemonics()
  const [story, setStory] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStarred, setIsStarred] = useState(false)

  const targetWords = useMemo(() => {
    return vocabulary
      .filter((item) => item.word?.trim())
      .sort((a, b) => (a.mastery_level ?? 0) - (b.mastery_level ?? 0))
      .slice(0, 5)
      .map((item) => item.word)
  }, [vocabulary])

  const histories = mnemonics.map((item) => item.story)

  const generateStory = async () => {
    if (targetWords.length === 0) return
    setIsLoading(true)
    setIsStarred(false)
    try {
      const response = await chat([{
        role: 'user',
        text: `请用以下英语单词编写一个有趣、易于记忆的短故事（中英对照，150字以内）。
要求：
1. 故事要生动有趣，有画面感
2. 每个单词在故事中要自然使用，并用【】标注
3. 最后给出每个单词在故事中的含义

单词：${targetWords.join(', ')}

格式：
🎭 英文故事:
(英文内容，目标单词用【】标注)

📖 中文翻译:
(中文翻译)

💡 词义解析:
- word: 含义`,
      }])
      setStory(response)
    } catch {
      setStory('❌ AI 生成失败，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!story || targetWords.length === 0 || isStarred) return
    const result = await saveMnemonic(targetWords, story)
    if (!result.error) {
      setIsStarred(true)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={goBack} className="p-1">
          <ChevronLeft size={24} className="text-[var(--color-foreground)]" />
        </button>
        <h1 className="text-[18px] font-bold text-[var(--color-foreground)] font-secondary">AI 速记</h1>
        <Sparkles size={16} className="text-[var(--color-primary)]" />
      </div>

      <div className="px-5 mb-4">
        <p className="text-[12px] text-[var(--color-muted)] mb-2">待记忆单词（来自词库）</p>
        <div className="flex flex-wrap gap-2">
          {targetWords.map((w, i) => (
            <span key={i} className="px-3 py-1.5 bg-[var(--color-primary-light)] rounded-full text-[13px] font-semibold text-[var(--color-primary)]">
              {w}
            </span>
          ))}
        </div>
      </div>

      {!vocabLoading && targetWords.length === 0 && (
        <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-sm)] text-center">
          <p className="text-[13px] text-[var(--color-foreground)] mb-2">词库为空，无法生成速记</p>
          <p className="text-[12px] text-[var(--color-muted)]">请先在翻译或阅读中收集单词</p>
        </div>
      )}

      {!story && !isLoading && targetWords.length > 0 && (
        <div className="mx-5 mb-5">
          <button
            onClick={generateStory}
            className="w-full py-4 flex items-center justify-center gap-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-[15px] font-semibold active:scale-[0.98] transition-transform"
          >
            <Sparkles size={18} />
            AI 生成记忆故事
          </button>
        </div>
      )}

      {(isLoading || vocabLoading) && (
        <div className="mx-5 mb-5 p-8 bg-[var(--color-card)] rounded-[var(--radius-md)] flex flex-col items-center gap-3"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <Loader2 size={28} className="text-[var(--color-primary)] animate-spin" />
          <p className="text-[13px] text-[var(--color-muted)]">
            {vocabLoading ? '正在读取词库...' : 'AI 正在编写记忆故事...'}
          </p>
        </div>
      )}

      {story && !isLoading && (
        <div className="mx-5 mb-5 p-4 bg-[var(--color-card)] rounded-[var(--radius-md)] border border-[var(--color-primary)]/15"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-[var(--color-primary)]" />
            <span className="text-[12px] text-[var(--color-primary)] font-semibold">AI 生成</span>
          </div>

          <div className="text-[14px] text-[var(--color-foreground)] leading-relaxed whitespace-pre-wrap mb-4">
            {story}
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-[var(--color-border)]">
            <button
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)] text-[12px] text-[var(--color-foreground)] active:scale-95 transition-transform"
              onClick={() => {
                if (isSpeaking()) {
                  stopSpeaking()
                } else if (story) {
                  speakAuto(story)
                }
              }}
            >
              <Volume2 size={14} /> {isSpeaking() ? '停止' : '朗读'}
            </button>
            <button
              onClick={generateStory}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)] text-[12px] text-[var(--color-foreground)]"
            >
              <RefreshCw size={14} /> 换一个
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--color-background-secondary)] rounded-[var(--radius-xs)] text-[12px] text-[var(--color-foreground)]"
            >
              <Star size={14} className={isStarred ? 'fill-[var(--color-primary)] text-[var(--color-primary)]' : ''} />
              {isStarred ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      )}

      {!memoLoading && histories.length > 0 && (
        <div className="mx-5 pb-8">
          <h3 className="text-[14px] font-bold text-[var(--color-foreground)] mb-3 font-secondary flex items-center gap-2">
            <Clock size={14} className="text-[var(--color-muted)]" /> 历史故事（来自数据库）
          </h3>
          <div className="space-y-2">
            {histories.map((h, i) => (
              <div key={i} className="p-3 bg-[var(--color-background-secondary)] rounded-[var(--radius-sm)]">
                <p className="text-[12px] text-[var(--color-foreground)] line-clamp-3 leading-relaxed">{h}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
